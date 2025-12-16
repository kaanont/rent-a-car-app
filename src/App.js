import React, { useState, useEffect } from 'react';
import './App.css'; 

// İkonlar
import { FaCar, FaCalendarAlt, FaUserShield, FaSignOutAlt, FaPlus, FaTrash, FaEdit, FaBolt, FaFilter, FaFileExcel, FaSearch, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { MdOutlineNoteAdd, MdDateRange } from 'react-icons/md';

// Bildirimler
import toast, { Toaster } from 'react-hot-toast';

// Excel Kütüphanesi
import * as XLSX from 'xlsx';

// Firebase
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyDSyO8t5RYYD7eejf43yLEFQ1kUL0fkCtE",
  authDomain: "rentacarapp-540c2.firebaseapp.com",
  projectId: "rentacarapp-540c2",
  storageBucket: "rentacarapp-540c2.firebasestorage.app",
  messagingSenderId: "457662344140",
  appId: "1:457662344140:web:b74f263cfa3d7deaa90b69",
  measurementId: "G-Y7LPQK4JQL"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('rentals');
  const [cars, setCars] = useState([]);
  const [rentals, setRentals] = useState([]); 
  const [filterStatus, setFilterStatus] = useState('all'); 

  // Form States
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Kiralama Formu
  const [selectedCarId, setSelectedCarId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [days, setDays] = useState(1); // Gün sayısı (sadece gösterim için veya bitiş tarihi hesaplamak için)
  const [endDate, setEndDate] = useState(''); // Yeni: Bitiş Tarihi (Manuel seçim için)
  const [customerName, setCustomerName] = useState('');
  const [manualPrice, setManualPrice] = useState(0);

  // MÜSAİTLİK ARAMA STATES (YENİ)
  const [searchStart, setSearchStart] = useState('');
  const [searchEnd, setSearchEnd] = useState('');
  const [availableCarsResults, setAvailableCarsResults] = useState(null); // null: arama yapılmadı, []: araç yok, [...]: araçlar var

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCar, setEditingCar] = useState(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingRental, setEditingRental] = useState(null);
  const [rentalNoteInput, setRentalNoteInput] = useState('');
  const [newCarForm, setNewCarForm] = useState({ brand: '', model: '', plate: '', priceMKD: '', adminNote: '' });

  // --- LISTENERS ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubCars = onSnapshot(collection(db, "cars"), (s) => setCars(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubRentals = onSnapshot(collection(db, "rentals"), (s) => setRentals(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    return () => { unsubCars(); unsubRentals(); };
  }, []);

  // --- MÜSAİTLİK ARAMA FONKSİYONU ---
  const handleAvailabilitySearch = (e) => {
    e.preventDefault();
    if (!searchStart || !searchEnd) return toast.error("Lütfen iki tarihi de seçin.");
    
    // Tarih mantık kontrolü
    if (new Date(searchStart) > new Date(searchEnd)) return toast.error("Başlangıç tarihi bitişten büyük olamaz!");

    // Seçilen aralık (Timestamp olarak)
    const sTime = new Date(searchStart).getTime();
    const eTime = new Date(searchEnd).getTime();

    // Filtreleme
    const foundCars = cars.filter(car => {
      // Bu araca ait tüm kiralamaları kontrol et
      const carRentals = rentals.filter(r => r.carId === car.id);
      
      // Herhangi bir kiralama ile çakışıyor mu?
      const hasConflict = carRentals.some(r => {
        const rParts = r.startDate.split('-');
        const rStart = new Date(rParts[0], rParts[1] - 1, rParts[2]).getTime();
        const rEnd = rStart + (r.days * 24 * 60 * 60 * 1000); // Bitiş zamanı
        
        // Çakışma Mantığı:
        // (Yeni Başlangıç < Mevcut Bitiş) VE (Yeni Bitiş > Mevcut Başlangıç)
        return (sTime < rEnd && eTime > rStart);
      });

      return !hasConflict; // Çakışma yoksa listeye al
    });

    setAvailableCarsResults(foundCars);
    if (foundCars.length > 0) {
      toast.success(`${foundCars.length} adet müsait araç bulundu!`);
    } else {
      toast.error("Bu tarihlerde müsait araç yok.");
    }
  };

  // Arama sonucundan araç seçince formu doldur
  const selectCarFromSearch = (car) => {
    setSelectedCarId(car.id);
    setStartDate(searchStart);
    // Gün farkını hesapla
    const diffTime = Math.abs(new Date(searchEnd) - new Date(searchStart));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 gün dahil
    setDays(diffDays);
    
    setAvailableCarsResults(null); // Arama sonucunu temizle
    toast.success(`${car.brand} seçildi. Formu doldurunuz.`);
    // Sayfayı forma kaydırabiliriz (opsiyonel)
  };

  // --- EXCEL ---
  const exportToExcel = () => {
    if (rentals.length === 0) return toast.error("İndirilecek kayıt yok.");
    const excelData = rentals.map(r => ({
      "Araç Adı": r.carName, "Plaka": r.plate, "Müşteri": r.customerName,
      "Başlangıç": r.startDate, "Gün": r.days, "Fiyat": r.totalPrice, "Not": r.adminNote || '', "Kiralayan": r.rentedBy
    }));
    const ws = XLSX.utils.json_to_sheet(excelData);
    const colWidths = [{ wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 8 }, { wch: 15 }, { wch: 30 }, { wch: 20 }];
    ws['!cols'] = colWidths;
    const range = XLSX.utils.decode_range(ws['!ref']);
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kiralamalar");
    const date = new Date();
    XLSX.writeFile(wb, `RentACar_Rapor_${date.toLocaleDateString('tr-TR')}_${date.getHours()}-${date.getMinutes()}.xlsx`);
    toast.success("Excel indirildi!");
  };

  // --- LOGIC ---
  const handleLogin = async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, email, password); setShowLogin(false); toast.success("Giriş başarılı!"); } catch { toast.error("Hatalı bilgi!"); }
  };
  const handleLogout = () => { signOut(auth); setActiveTab('fleet'); toast('Çıkış yapıldı', { icon: '👋' }); };

  // Fiyat Hesapla
  useEffect(() => {
    if (selectedCarId && days > 0) {
      const car = cars.find(c => c.id === selectedCarId);
      if (car) setManualPrice(car.priceMKD * days);
    }
  }, [selectedCarId, days, cars]);

  // Manuel Çakışma Kontrolü (Formdan direkt girilirse)
  const isCarAvailable = (carId, startStr, durationDays) => {
    const sParts = startStr.split('-');
    const newStart = new Date(sParts[0], sParts[1] - 1, sParts[2]).getTime();
    const newEnd = newStart + (durationDays * 24 * 60 * 60 * 1000);
    const conflict = rentals.find(r => {
      if (r.carId !== carId) return false;
      const rParts = r.startDate.split('-');
      const rStart = new Date(rParts[0], rParts[1] - 1, rParts[2]).getTime();
      const rEnd = rStart + (r.days * 24 * 60 * 60 * 1000);
      return (newStart < rEnd && newEnd > rStart);
    });
    return !conflict;
  };

  const getCarCurrentStatus = (carId) => {
    const now = new Date(); now.setHours(0, 0, 0, 0); const todayTime = now.getTime();
    const activeRental = rentals.find(r => {
      if (r.carId !== carId) return false;
      const rParts = r.startDate.split('-');
      const start = new Date(rParts[0], rParts[1] - 1, rParts[2]).getTime();
      const end = start + (r.days * 24 * 60 * 60 * 1000);
      return (todayTime >= start && todayTime < end);
    });
    if (activeRental) {
      const rParts = activeRental.startDate.split('-');
      const endObj = new Date(new Date(rParts[0], rParts[1] - 1, rParts[2]).getTime() + (activeRental.days * 24 * 60 * 60 * 1000));
      return { status: 'Kirada', returnDate: endObj.toLocaleDateString('tr-TR'), customer: activeRental.customerName, nextReservation: null };
    }
    const futureRentals = rentals.filter(r => {
      if (r.carId !== carId) return false;
      const rParts = r.startDate.split('-');
      const start = new Date(rParts[0], rParts[1] - 1, rParts[2]).getTime();
      return start > todayTime;
    });
    if (futureRentals.length > 0) {
      futureRentals.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      const nextRental = futureRentals[0];
      const nParts = nextRental.startDate.split('-');
      return { status: 'Müsait', returnDate: null, customer: null, nextReservation: { date: `${nParts[2]}.${nParts[1]}.${nParts[0]}`, customer: nextRental.customerName } };
    }
    return { status: 'Müsait', returnDate: null, customer: null, nextReservation: null };
  };

  const handleRent = async (e) => {
    e.preventDefault();
    if (!user) return toast.error("Yetkiniz yok!");
    if (!startDate || !customerName || !selectedCarId) return toast.error("Eksik bilgi!");
    if (!isCarAvailable(selectedCarId, startDate, days)) return toast.error("Araç dolu!");
    
    const car = cars.find(c => c.id === selectedCarId);
    await addDoc(collection(db, "rentals"), {
      carId: car.id, carName: `${car.brand} ${car.model}`, plate: car.plate,
      customerName, startDate, days: parseInt(days), totalPrice: parseInt(manualPrice),
      rentedBy: user.email, rentedById: user.uid, adminNote: ''
    });
    toast.success("Kiralama Başarılı!");
    setCustomerName(''); setDays(1); setAvailableCarsResults(null); // Listeyi temizle
  };

  const handleQuickRent = (carId) => {
    if(!user) return; setSelectedCarId(carId); setActiveTab('rentals'); setStartDate(new Date().toISOString().split('T')[0]); toast("Kiralama ekranı", { icon: '⚡' });
  };
  const handleDeleteRental = async (id) => { if(user && window.confirm("Silinsin mi?")) { await deleteDoc(doc(db, "rentals", id)); toast.success("Silindi"); } };
  const saveRentalNote = async () => { if(user) { await updateDoc(doc(db, "rentals", editingRental.id), { adminNote: rentalNoteInput }); setIsNoteModalOpen(false); setEditingRental(null); toast.success("Not kaydedildi"); } };
  const handleAddCar = async (e) => { e.preventDefault(); if(user) { await addDoc(collection(db, "cars"), { ...newCarForm, priceMKD: parseInt(newCarForm.priceMKD) }); setNewCarForm({ brand: '', model: '', plate: '', priceMKD: '', adminNote: '' }); toast.success("Eklendi"); } };
  const handleDeleteCar = async (id) => { if(user && window.confirm("Araç silinsin mi?")) { await deleteDoc(doc(db, "cars", id)); toast.success("Silindi"); } };
  const saveEditModal = async () => { if(user) { await updateDoc(doc(db, "cars", editingCar.id), { brand: editingCar.brand, model: editingCar.model, plate: editingCar.plate, priceMKD: parseInt(editingCar.priceMKD), adminNote: editingCar.adminNote }); setIsEditModalOpen(false); setEditingCar(null); toast.success("Güncellendi"); } };

  const filteredCars = cars.filter(car => {
    const statusInfo = getCarCurrentStatus(car.id);
    if (filterStatus === 'rented') return statusInfo.status === 'Kirada';
    if (filterStatus === 'available') return statusInfo.status === 'Müsait';
    return true;
  });

  return (
    <div className="container">
      <Toaster position="top-right" />
      {showLogin && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>🔐 Yönetici Girişi</h3>
            <form onSubmit={handleLogin}>
              <div className="form-group"><input className="form-input" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required /></div>
              <div className="form-group"><input className="form-input" type="password" placeholder="Şifre" value={password} onChange={e=>setPassword(e.target.value)} required /></div>
              <div style={{display:'flex', gap:'10px'}}><button type="submit" className="btn-primary">Giriş Yap</button><button type="button" onClick={()=>setShowLogin(false)} className="btn-logout" style={{flex:1, textAlign:'center'}}>İptal</button></div>
            </form>
          </div>
        </div>
      )}

      <div className="header">
        <div><h2>Rent a Car v14</h2><p style={{margin:0, color:'#666', fontSize:'14px'}}>{user ? `👤 Yönetici: ${user.email}` : '👁️ İzleme Modu'}</p></div>
        <div>{user ? <button onClick={handleLogout} className="btn-logout"><FaSignOutAlt /> Çıkış</button> : <button onClick={()=>setShowLogin(true)} className="btn-primary" style={{width:'auto', padding:'10px 20px'}}><FaUserShield /> Yönetici</button>}</div>
      </div>

      <div className="tab-menu">
        <button onClick={() => setActiveTab('rentals')} className={`tab-btn ${activeTab==='rentals' ? 'active' : ''}`}><FaCalendarAlt /> Kiralama İşlemleri</button>
        <button onClick={() => setActiveTab('fleet')} className={`tab-btn ${activeTab==='fleet' ? 'active' : ''}`}><FaCar /> Araç Filosu & Durum</button>
      </div>

      {/* --- RENTALS TAB (DÜZENLENDİ: ÜSTTE ARAMA VE FORM, ALTTA GENİŞ TABLO) --- */}
      {activeTab === 'rentals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* ÜST KISIM: ARAMA MOTORU + FORM */}
          {user && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', alignItems: 'start' }}>
              
              {/* 1. MÜSAİTLİK SORGULAMA (YENİ) */}
              <div className="card" style={{ background: '#eef2ff', border: '1px solid #c7d2fe' }}>
                <h3 style={{color: '#4338ca', display:'flex', alignItems:'center', gap:'10px'}}><FaSearch /> Boş Araç Bul</h3>
                <div style={{display:'flex', gap:'10px', alignItems:'end'}}>
                  <div className="form-group" style={{flex:1, margin:0}}>
                    <label style={{fontSize:'12px', fontWeight:'bold'}}>Giriş Tarihi</label>
                    <input className="form-input" type="date" value={searchStart} onChange={e => setSearchStart(e.target.value)} />
                  </div>
                  <div className="form-group" style={{flex:1, margin:0}}>
                    <label style={{fontSize:'12px', fontWeight:'bold'}}>Dönüş Tarihi</label>
                    <input className="form-input" type="date" value={searchEnd} onChange={e => setSearchEnd(e.target.value)} />
                  </div>
                  <button onClick={handleAvailabilitySearch} className="btn-primary" style={{width:'auto', background:'#4338ca'}}><FaSearch /></button>
                </div>

                {/* ARAMA SONUÇLARI */}
                {availableCarsResults && (
                  <div style={{marginTop:'15px', maxHeight:'200px', overflowY:'auto', background:'white', padding:'10px', borderRadius:'8px'}}>
                    {availableCarsResults.length === 0 ? <p style={{color:'red'}}>Uygun araç yok!</p> : (
                      <div style={{display:'grid', gridTemplateColumns:'1fr', gap:'5px'}}>
                        {availableCarsResults.map(car => (
                          <div key={car.id} onClick={() => selectCarFromSearch(car)} 
                               style={{padding:'10px', border:'1px solid #eee', borderRadius:'5px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', transition:'0.2s'}}
                               onMouseOver={e => e.currentTarget.style.background = '#f0f9ff'}
                               onMouseOut={e => e.currentTarget.style.background = 'white'}>
                            <div><strong>{car.brand} {car.model}</strong> <span style={{fontSize:'12px', color:'#666'}}>{car.plate}</span></div>
                            <div className="badge badge-success">{car.priceMKD} MKD</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. KİRALAMA FORMU */}
              <div className="card">
                <h3><FaPlus /> Kiralama Kaydı Oluştur</h3>
                <form onSubmit={handleRent}>
                  <div className="form-group"><select className="form-select" value={selectedCarId} onChange={e => setSelectedCarId(e.target.value)}><option value="">-- Araç Seç (veya Soldan Ara) --</option>{cars.map(c => <option key={c.id} value={c.id}>{c.brand} {c.model}</option>)}</select></div>
                  <div className="form-group"><input className="form-input" placeholder="Müşteri Adı Soyadı" value={customerName} onChange={e => setCustomerName(e.target.value)} /></div>
                  <div style={{display:'flex', gap:'10px'}}>
                      <div className="form-group" style={{flex:2}}><label style={{fontSize:'11px'}}>Başlangıç</label><input className="form-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
                      <div className="form-group" style={{flex:1}}><label style={{fontSize:'11px'}}>Gün</label><input className="form-input" type="number" min="1" value={days} onChange={e => setDays(e.target.value)} /></div>
                  </div>
                  <div className="form-group"><label style={{fontSize:'11px'}}>Toplam Fiyat</label><input className="form-input" type="number" value={manualPrice} onChange={e => setManualPrice(e.target.value)} /></div>
                  <button type="submit" className="btn-primary">Kaydet</button>
                </form>
              </div>
            </div>
          )}

          {/* ALT KISIM: GENİŞ TABLO (Full Width) */}
          <div className="card" style={{ width: '100%' }}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
               <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                 <h3>📋 Aktif Kiralamalar</h3>
                 <span className="badge badge-success">{rentals.length} Kayıt</span>
               </div>
               {user && <button onClick={exportToExcel} className="action-btn" style={{background:'#10b981', color:'white', fontWeight:'bold', padding:'8px 15px', borderRadius:'8px', fontSize:'13px', display:'flex', gap:'5px'}}><FaFileExcel /> Excel İndir</button>}
            </div>
            <div className="table-container">
                <table style={{width:'100%'}}>
                <thead><tr><th>Araç</th><th>Müşteri</th><th>Tarih / Süre</th><th>Yönetici Notu</th>{user && <th>Yönet</th>}</tr></thead>
                <tbody>
                    {rentals.map(r => (
                    <tr key={r.id}>
                        <td style={{width:'25%'}}><strong>{r.carName}</strong><br/><span style={{fontSize:'12px', color:'#999'}}>{r.plate}</span></td>
                        <td style={{width:'20%'}}>{r.customerName}</td>
                        <td style={{width:'15%'}}>{r.startDate}<br/><span className="badge badge-warning">{r.days} Gün</span></td>
                        <td style={{width:'25%'}}>
                            <div style={{fontSize:'12px', color:'#555', fontStyle:'italic'}}>{r.adminNote || '-'}</div>
                            {user && <button className="action-btn btn-edit" onClick={()=>{setEditingRental(r); setRentalNoteInput(r.adminNote||''); setIsNoteModalOpen(true)}}><MdOutlineNoteAdd /></button>}
                        </td>
                        {user && <td style={{width:'15%'}}><button className="action-btn btn-delete" onClick={()=>handleDeleteRental(r.id)}><FaTrash /> Sil</button></td>}
                    </tr>
                    ))}
                    {rentals.length === 0 && <tr><td colSpan="5" style={{textAlign:'center', color:'#999', padding:'30px'}}>Aktif kiralama bulunmuyor.</td></tr>}
                </tbody>
                </table>
            </div>
          </div>
        </div>
      )}

      {/* --- FLEET TAB (Değişmedi, aynı kaldı) --- */}
      {activeTab === 'fleet' && (
        <div>
          {user && (
            <div className="card" style={{ marginBottom: '20px' }}>
              <h3><FaPlus /> Hızlı Araç Ekle</h3>
              <form onSubmit={handleAddCar} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '15px', alignItems:'end' }}>
                <div className="form-group" style={{margin:0}}><label style={{fontSize:'12px'}}>Marka</label><input className="form-input" value={newCarForm.brand} onChange={e=>setNewCarForm({...newCarForm, brand:e.target.value})} /></div>
                <div className="form-group" style={{margin:0}}><label style={{fontSize:'12px'}}>Model</label><input className="form-input" value={newCarForm.model} onChange={e=>setNewCarForm({...newCarForm, model:e.target.value})} /></div>
                <div className="form-group" style={{margin:0}}><label style={{fontSize:'12px'}}>Plaka</label><input className="form-input" value={newCarForm.plate} onChange={e=>setNewCarForm({...newCarForm, plate:e.target.value})} /></div>
                <div className="form-group" style={{margin:0}}><label style={{fontSize:'12px'}}>Fiyat</label><input className="form-input" type="number" value={newCarForm.priceMKD} onChange={e=>setNewCarForm({...newCarForm, priceMKD:e.target.value})} /></div>
                <button type="submit" className="btn-primary" style={{height:'42px'}}>Ekle</button>
              </form>
            </div>
          )}
          <div className="card">
            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <FaFilter style={{color:'#666'}} />
                <button onClick={()=>setFilterStatus('all')} className={`badge ${filterStatus==='all'?'badge-warning':''}`} style={{border:'none', cursor:'pointer'}}>Tümü</button>
                <button onClick={()=>setFilterStatus('available')} className={`badge ${filterStatus==='available'?'badge-success':''}`} style={{border:'none', cursor:'pointer'}}>Müsaitler</button>
                <button onClick={()=>setFilterStatus('rented')} className={`badge ${filterStatus==='rented'?'badge-danger':''}`} style={{border:'none', cursor:'pointer'}}>Kiradakiler</button>
            </div>
            <div className="table-container">
                <table>
                <thead><tr><th>Araç</th><th>Plaka</th><th>Aktif Müşteri</th><th>Durum</th>{user && <th>Yönetim</th>}</tr></thead>
                <tbody>
                    {filteredCars.map(car => {
                    const statusInfo = getCarCurrentStatus(car.id);
                    const isRented = statusInfo.status === 'Kirada';
                    return (
                        <tr key={car.id}>
                        <td><strong style={{color:'var(--primary)'}}>{car.brand}</strong> {car.model}</td>
                        <td style={{fontFamily:'monospace', fontWeight:'bold'}}>{car.plate}</td>
                        <td>{statusInfo.customer ? <strong>{statusInfo.customer}</strong> : '-'}</td>
                        <td>{isRented ? <div><span className="badge badge-danger">KİRADA</span><div style={{fontSize:'11px', marginTop:'4px'}}>Dönüş: {statusInfo.returnDate}</div></div> : <div><span className="badge badge-success">MÜSAİT</span>{statusInfo.nextReservation && <div style={{fontSize:'11px', marginTop:'4px', color:'#b45309'}}>⚠️ Rzv: {statusInfo.nextReservation.date}</div>}</div>}</td>
                        {user && <td>{!isRented && <button className="action-btn btn-quick" onClick={()=>handleQuickRent(car.id)}><FaBolt /></button>}<button className="action-btn btn-edit" onClick={()=>{setEditingCar(car); setIsEditModalOpen(true)}}><FaEdit /></button><button className="action-btn btn-delete" onClick={()=>handleDeleteCar(car.id)}><FaTrash /></button></td>}
                        </tr>
                    );
                    })}
                </tbody>
                </table>
            </div>
          </div>
        </div>
      )}

      {/* MODALLER (Aynı kaldı) */}
      {isEditModalOpen && user && editingCar && (
        <div className="modal-overlay"><div className="modal-content"><h3>Araç Düzenle</h3><div className="form-group"><input className="form-input" value={editingCar.brand} onChange={e=>setEditingCar({...editingCar, brand:e.target.value})} /></div><div className="form-group"><input className="form-input" value={editingCar.model} onChange={e=>setEditingCar({...editingCar, model:e.target.value})} /></div><div className="form-group"><input className="form-input" value={editingCar.plate} onChange={e=>setEditingCar({...editingCar, plate:e.target.value})} /></div><div className="form-group"><input className="form-input" value={editingCar.priceMKD} onChange={e=>setEditingCar({...editingCar, priceMKD:e.target.value})} /></div><div className="form-group"><textarea className="form-input" value={editingCar.adminNote} onChange={e=>setEditingCar({...editingCar, adminNote:e.target.value})} /></div><div style={{display:'flex', gap:'10px'}}><button className="btn-primary" onClick={saveEditModal}>Kaydet</button><button className="btn-logout" onClick={()=>setIsEditModalOpen(false)} style={{flex:1, textAlign:'center'}}>İptal</button></div></div></div>
      )}
      {isNoteModalOpen && user && editingRental && (
        <div className="modal-overlay"><div className="modal-content"><h3>Kiralama Notu</h3><div className="form-group"><textarea className="form-input" rows="5" value={rentalNoteInput} onChange={e=>setRentalNoteInput(e.target.value)} /></div><div style={{display:'flex', gap:'10px'}}><button className="btn-primary" onClick={saveRentalNote}>Kaydet</button><button className="btn-logout" onClick={()=>setIsNoteModalOpen(false)} style={{flex:1, textAlign:'center'}}>İptal</button></div></div></div>
      )}
    </div>
  );
}