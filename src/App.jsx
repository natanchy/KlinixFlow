import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  BedDouble,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cloud,
  CloudOff,
  Cpu,
  Hash,
  LayoutDashboard,
  Lock,
  LogOut,
  Mic,
  Plus,
  RefreshCw,
  Shield,
  Stethoscope,
  Trash2,
  User,
  Users,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react';
import { enqueue, dequeue, removeById } from './queueLogic';
import { db, isFirebaseConfigured, ref, onValue, set } from './firebase';
import { broadcastCloud, subscribeCloud } from './cloudSync';

// ─── LocalStorage Helpers ───────────────────────────────────────────────────
const LS_QUEUE = 'klinixflow_queue';
const LS_ROOMS = 'klinixflow_rooms';
const LS_LOG   = 'klinixflow_log';

const INITIAL_ROOMS = [
  { id: 1, label: 'Ruang 1', patient: null, doctor: 'dr. Andi Saputra' },
  { id: 2, label: 'Ruang 2', patient: null, doctor: 'dr. Siti Rahma' },
  { id: 3, label: 'Ruang 3', patient: null, doctor: 'dr. Budi Santoso' },
];

// ─── Accounts ───────────────────────────────────────────────────────────────
// Tambah/ubah akun di sini. role: 'admin' | 'user'
const ACCOUNTS = [
  { username: 'admin',   password: 'admin123', role: 'admin' },
  { username: 'petugas', password: 'petugas1', role: 'admin' },
  { username: 'pasien',  password: 'pasien1',  role: 'user'  },
  { username: 'user',    password: 'user123',  role: 'user'  },
];

// Cross-tab broadcast channel for instant real-time synchronization
const syncChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('klinixflow_sync')
  : null;

function loadLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

function saveLS(key, value) {
  try {
    const serialized = JSON.stringify(value);
    if (localStorage.getItem(key) === serialized) return;
    localStorage.setItem(key, serialized);
    if (syncChannel) {
      syncChannel.postMessage({ key, value });
    }
  } catch (e) {
    console.error('Error saving to localStorage:', e);
  }
}

// ─── TTS ────────────────────────────────────────────────────────────────────
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'id-ID'; u.rate = 0.9; u.pitch = 1.1;
  window.speechSynthesis.speak(u);
}

// ─── Shared Components ───────────────────────────────────────────────────────
function Badge({ type }) {
  if (type === 'IGD') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
      <Zap size={10} className="fill-red-400" /> IGD
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
      <Activity size={10} /> Reguler
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const c = {
    blue:   'from-sky-500/20 to-sky-600/5 border-sky-500/20 text-sky-400',
    red:    'from-red-500/20 to-red-600/5 border-red-500/20 text-red-400',
    green:  'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
    purple: 'from-violet-500/20 to-violet-600/5 border-violet-500/20 text-violet-400',
  }[color];
  return (
    <div className={`bg-gradient-to-br ${c} border rounded-2xl p-5 flex items-center gap-4`}>
      <div className="p-3 rounded-xl bg-slate-800/60"><Icon size={22} className={c.split(' ')[3]} /></div>
      <div>
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</p>
        <p className="text-3xl font-bold text-slate-100 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function RoleBadge({ role }) {
  if (role === 'admin') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
      <Shield size={10} /> Admin
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/20 text-sky-400 border border-sky-500/40">
      <User size={10} /> User
    </span>
  );
}

// ─── Login Screen ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [form, setForm]       = useState({ username: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setTimeout(() => {
      const account = ACCOUNTS.find(
        a => a.username === form.username.trim() && a.password === form.password
      );
      if (account) onLogin(account);
      else setError('Username atau password salah.');
      setLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-sky-400 to-cyan-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-sky-500/40 mb-4">
            <Activity size={30} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Klinix<span className="bg-gradient-to-r from-sky-400 to-cyan-400 bg-clip-text text-transparent">Flow</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">Sistem Antrian Klinik</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6 shadow-2xl">
          <h2 className="font-bold text-slate-100 text-lg mb-1">Masuk ke Sistem</h2>
          <p className="text-xs text-slate-500 mb-6">Gunakan akun yang telah diberikan</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Username</label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="text" value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  placeholder="Masukkan username" autoComplete="username"
                  className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50 transition-colors text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="password" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Masukkan password" autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50 transition-colors text-sm" />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <XCircle size={16} /> {error}
              </div>
            )}

            <button type="submit" disabled={loading || !form.username || !form.password}
              className="w-full py-3.5 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 text-sm">
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Activity size={16} />}
              {loading ? 'Memverifikasi...' : 'Masuk'}
            </button>
          </form>

          {/* Demo hint */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <p className="text-xs text-slate-600 font-semibold uppercase tracking-wider mb-3">Akun Demo</p>
            <div className="space-y-2">
              {[
                { label: 'Admin / Petugas', u: 'admin',  p: 'admin123', role: 'admin' },
                { label: 'User / Pasien',   u: 'user',   p: 'user123',  role: 'user'  },
              ].map(d => (
                <button key={d.u} type="button"
                  onClick={() => setForm({ username: d.u, password: d.p })}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 transition-colors">
                  <div className="flex items-center gap-2">
                    {d.role === 'admin'
                      ? <Shield size={13} className="text-amber-400" />
                      : <User   size={13} className="text-sky-400"   />}
                    <span className="text-xs font-semibold text-slate-300">{d.label}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">{d.u} / {d.p}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 1: Dashboard Antrean ────────────────────────────────────────────────
function DashboardTab({ queue, setQueue, rooms, setRooms, addLog, currentUser }) {
  const isAdmin = currentUser.role === 'admin';
  const [form, setForm]           = useState({ name: '', complaint: '', status: 'Reguler' });
  const [notification, setNotif] = useState(null);
  const [isSubmitting, setSub]   = useState(false);

  const showNotif = useCallback((msg, type = 'success') => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.complaint.trim()) { showNotif('Mohon isi semua kolom!', 'error'); return; }
    setSub(true);
    const patient = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: form.name.trim(), complaint: form.complaint.trim(), status: form.status,
    };
    setTimeout(() => {
      setQueue(enqueue(queue, patient));
      addLog(`Pasien "${patient.name}" (${patient.status}) didaftarkan oleh ${currentUser.username}.`);
      broadcastCloud({ type: 'ENQUEUE', patient, user: currentUser.username });
      showNotif(`${patient.name} berhasil didaftarkan!`);
      setForm({ name: '', complaint: '', status: 'Reguler' });
      setSub(false);
    }, 400);
  };

  const handleCall = () => {
    if (!queue.length) { showNotif('Antrean kosong!', 'error'); return; }
    const room = rooms.find(r => !r.patient);
    if (!room) { showNotif('Semua ruang sedang terisi.', 'error'); return; }
    const { patient, newQueue } = dequeue(queue);
    setQueue(newQueue);
    setRooms(rooms.map(r => r.id === room.id ? { ...r, patient } : r));
    addLog(`Pasien "${patient.name}" dipanggil → ${room.label}.`);
    speak(`Nomor antrean atas nama ${patient.name}, silakan masuk ke ruang periksa`);
    broadcastCloud({ type: 'CALL', patient, room });
    showNotif(`${patient.name} dipanggil ke ${room.label}!`);
  };

  const handleRemove = (id, name) => {
    setQueue(removeById(queue, id));
    addLog(`Pasien "${name}" dihapus oleh ${currentUser.username}.`);
    broadcastCloud({ type: 'REMOVE', patientId: id, patientName: name });
    showNotif(`${name} dihapus dari antrean.`, 'info');
  };

  const igd      = queue.filter(p => p.status === 'IGD');
  const reg      = queue.filter(p => p.status === 'Reguler');
  const freeRooms = rooms.filter(r => !r.patient).length;

  return (
    <div className="space-y-6 animate-[fadeIn_0.4s_ease-out]">
      {/* Toast */}
      {notification && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-sm text-sm font-medium animate-[slideIn_0.3s_ease-out]
          ${notification.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/50 text-emerald-300'
          : notification.type === 'error'   ? 'bg-red-900/90 border-red-500/50 text-red-300'
          : 'bg-sky-900/90 border-sky-500/50 text-sky-300'}`}>
          {notification.type === 'success' ? <CheckCircle2 size={18} />
           : notification.type === 'error' ? <XCircle size={18} />
           : <Bell size={18} />}
          {notification.msg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}        label="Total Antrean"  value={queue.length} color="blue" />
        <StatCard icon={AlertTriangle} label="Pasien IGD"    value={igd.length}   color="red" />
        <StatCard icon={Activity}      label="Pasien Reguler" value={reg.length}  color="purple" />
        <StatCard icon={BedDouble}     label="Ruang Tersedia" value={freeRooms}   color="green" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Form Registrasi */}
        <div className="xl:col-span-2 bg-slate-900 border border-slate-700/60 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-sky-500/10 rounded-xl"><Plus size={20} className="text-sky-400" /></div>
            <div>
              <h2 className="font-bold text-slate-100 text-lg">Daftarkan Pasien</h2>
              <p className="text-xs text-slate-500">Isi formulir pendaftaran</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Nama Pasien</label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input type="text" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Masukkan nama lengkap"
                  className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50 transition-colors text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Keluhan</label>
              <textarea value={form.complaint}
                onChange={e => setForm({ ...form, complaint: e.target.value })}
                placeholder="Deskripsikan keluhan pasien" rows={3}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50 transition-colors text-sm resize-none" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Status Pasien</label>
              <div className="grid grid-cols-2 gap-3">
                {['Reguler', 'IGD'].map(s => (
                  <button key={s} type="button" onClick={() => setForm({ ...form, status: s })}
                    className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all duration-200
                      ${form.status === s
                        ? s === 'IGD' ? 'bg-red-500/20 border-red-500 text-red-300'
                                      : 'bg-sky-500/20 border-sky-500 text-sky-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                    {s === 'IGD' ? '⚡ IGD' : '🔵 Reguler'}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" disabled={isSubmitting}
              className="w-full py-3.5 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 disabled:opacity-60 text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 text-sm">
              {isSubmitting ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
              {isSubmitting ? 'Mendaftarkan...' : 'Daftarkan Pasien'}
            </button>
          </form>

          {/* Panggil — ADMIN ONLY */}
          <div className="mt-6 pt-6 border-t border-slate-700/60">
            {isAdmin ? (
              <>
                <button onClick={handleCall} disabled={!queue.length}
                  className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2.5">
                  <Mic size={18} />
                  Panggil Pasien Terdepan
                  {queue.length > 0 && (
                    <span className="bg-white/20 px-2 py-0.5 rounded-lg text-xs">{queue[0]?.name?.split(' ')[0]}</span>
                  )}
                </button>
                {!queue.length && <p className="text-center text-xs text-slate-600 mt-2">Antrean sedang kosong</p>}
              </>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                <Lock size={15} className="text-amber-500/60 flex-shrink-0" />
                <p className="text-xs text-slate-500">
                  Hanya <span className="text-amber-400 font-semibold">Admin</span> yang dapat memanggil pasien.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Daftar Antrean */}
        <div className="xl:col-span-3 bg-slate-900 border border-slate-700/60 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-500/10 rounded-xl"><LayoutDashboard size={20} className="text-violet-400" /></div>
              <div>
                <h2 className="font-bold text-slate-100 text-lg">Antrean Aktif</h2>
                <p className="text-xs text-slate-500">Urutan berdasarkan prioritas</p>
              </div>
            </div>
            <span className="bg-slate-800 text-slate-300 text-sm font-bold px-3 py-1 rounded-xl border border-slate-700">
              {queue.length} pasien
            </span>
          </div>

          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-600">
              <Users size={48} className="mb-4 opacity-30" />
              <p className="font-semibold">Antrean Kosong</p>
              <p className="text-sm mt-1">Daftarkan pasien menggunakan form di samping</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto scrollbar-thin pr-1">
              {queue.map((patient, idx) => (
                <QueueCard key={patient.id} patient={patient} position={idx + 1}
                  isHead={idx === 0} isTail={idx === queue.length - 1}
                  onRemove={isAdmin ? () => handleRemove(patient.id, patient.name) : null} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueCard({ patient, position, isHead, isTail, onRemove }) {
  const isIGD = patient.status === 'IGD';
  return (
    <div className={`relative flex items-start gap-4 p-4 rounded-xl border transition-all duration-300
      ${isIGD ? 'bg-red-950/40 border-red-500/50' : 'bg-slate-800/60 border-slate-700/60 hover:border-slate-600'}`}>
      <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm
        ${isIGD ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-300'}`}>{position}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-100 truncate">{patient.name}</span>
          <Badge type={patient.status} />
          {isHead && <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">HEAD</span>}
          {isTail && !isHead && <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">TAIL</span>}
        </div>
        <p className="text-xs text-slate-400 mt-1 truncate">{patient.complaint}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1 text-[10px] text-slate-600 font-mono"><Hash size={9} />{patient.queueNumber.toString().padStart(3, '0')}</span>
          <span className="flex items-center gap-1 text-[10px] text-slate-600 font-mono"><Cpu size={9} />{patient.address}</span>
          <span className="flex items-center gap-1 text-[10px] text-slate-600"><Clock size={9} />{new Date(patient.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* Trash — admin only */}
      {onRemove
        ? <button onClick={onRemove} className="flex-shrink-0 p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Hapus"><Trash2 size={15} /></button>
        : <div className="flex-shrink-0 w-9" />}
    </div>
  );
}

// ─── Tab 2: Manajemen Ruangan ─────────────────────────────────────────────────
function RoomsTab({ rooms, setRooms, addLog, currentUser, logs }) {
  const isAdmin  = currentUser.role === 'admin';
  const occupied = rooms.filter(r => r.patient).length;

  const handleFinish = (room) => {
    setRooms(rooms.map(r => r.id === room.id ? { ...r, patient: null } : r));
    addLog(`Pemeriksaan "${room.patient?.name}" di ${room.label} selesai.`);
    broadcastCloud({ type: 'FINISH', roomId: room.id, roomLabel: room.label });
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.4s_ease-out]">
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={BedDouble}    label="Total Ruang"   value={rooms.length}           color="blue" />
        <StatCard icon={Stethoscope}  label="Sedang Aktif"  value={occupied}               color="red" />
        <StatCard icon={CheckCircle2} label="Ruang Kosong"  value={rooms.length - occupied} color="green" />
      </div>

      {/* Notice untuk user */}
      {!isAdmin && (
        <div className="flex items-center gap-3 px-5 py-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
          <Lock size={17} className="flex-shrink-0 text-amber-400" />
          <p className="text-sm text-amber-300">
            Anda login sebagai <span className="font-bold">User</span>. Hanya bisa melihat status ruangan — aksi manajemen membutuhkan akses <span className="font-bold">Admin</span>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {rooms.map(room => (
          <RoomCard key={room.id} room={room} onFinish={isAdmin ? () => handleFinish(room) : null} />
        ))}
      </div>

      {/* Log — admin only */}
      {isAdmin ? <ActivityLog logs={logs} /> : (
        <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-5 flex items-center gap-3">
          <Lock size={15} className="text-amber-500/60 flex-shrink-0" />
          <p className="text-sm text-slate-500">
            Log aktivitas hanya tersedia untuk <span className="text-amber-400 font-semibold">Admin</span>.
          </p>
        </div>
      )}
    </div>
  );
}

function RoomCard({ room, onFinish }) {
  const busy = !!room.patient;
  return (
    <div className={`bg-slate-900 rounded-2xl border-2 p-6 transition-all duration-500
      ${busy ? 'border-orange-500/50 shadow-lg shadow-orange-500/10' : 'border-emerald-500/30 shadow-lg shadow-emerald-500/5'}`}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${busy ? 'bg-orange-500/15' : 'bg-emerald-500/15'}`}>
            <Stethoscope size={20} className={busy ? 'text-orange-400' : 'text-emerald-400'} />
          </div>
          <div>
            <h3 className="font-bold text-slate-100">{room.label}</h3>
            <p className="text-xs text-slate-500">{room.doctor}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold
          ${busy ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${busy ? 'bg-orange-400 animate-pulse' : 'bg-emerald-400'}`} />
          {busy ? 'Aktif' : 'Tersedia'}
        </div>
      </div>

      {busy ? (
        <div className="space-y-4">
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/40">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Pasien saat ini</p>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center">
                <User size={16} className="text-orange-400" />
              </div>
              <div>
                <p className="font-bold text-slate-100 text-sm">{room.patient.name}</p>
                <p className="text-xs text-slate-400 truncate max-w-[140px]">{room.patient.complaint}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Badge type={room.patient.status} />
              <span className="text-xs text-slate-600 font-mono">#{room.patient.queueNumber?.toString().padStart(3,'0')}</span>
            </div>
          </div>
          {onFinish ? (
            <button onClick={onFinish}
              className="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold rounded-xl transition-all duration-200 shadow-md flex items-center justify-center gap-2 text-sm">
              <CheckCircle2 size={16} /> Selesai Pemeriksaan
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs text-slate-600 py-2">
              <Lock size={12} className="text-amber-500/50" /> Hanya Admin yang dapat menyelesaikan pemeriksaan
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-slate-600">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/20 border-dashed flex items-center justify-center mb-3">
            <BedDouble size={28} className="text-emerald-600/60" />
          </div>
          <p className="font-semibold text-emerald-600/80 text-sm">Tersedia</p>
          <p className="text-xs mt-1">Siap menerima pasien</p>
        </div>
      )}
    </div>
  );
}

function ActivityLog({ logs = [] }) {
  if (!logs.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-violet-500/10 rounded-xl"><Clock size={18} className="text-violet-400" /></div>
        <h3 className="font-bold text-slate-100">Log Aktivitas</h3>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
        {[...logs].reverse().map((log, i) => (
          <div key={i} className="flex items-start gap-3 text-xs py-2 border-b border-slate-800 last:border-0">
            <span className="text-slate-600 font-mono flex-shrink-0 mt-0.5">
              {new Date(log.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-slate-400">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab 3: Visualisasi Memori (Admin Only) ───────────────────────────────────
function MemoryTab({ queue }) {
  return (
    <div className="space-y-6 animate-[fadeIn_0.4s_ease-out]">
      <div className="bg-gradient-to-br from-violet-900/40 to-indigo-900/20 border border-violet-500/30 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-violet-500/20 rounded-xl flex-shrink-0"><Cpu size={24} className="text-violet-400" /></div>
          <div>
            <h2 className="text-xl font-bold text-slate-100 mb-1">Visualisasi Memori – Edukasi C++</h2>
            <p className="text-sm text-slate-400">
              Representasi visual antrian sebagai <strong className="text-violet-300">Singly Linked List</strong> berikut simulasi
              alokasi memori (pointer) seperti yang terjadi pada program C++.
              Setiap node menyimpan data pasien dan sebuah pointer <code className="bg-slate-800 px-1.5 py-0.5 rounded text-violet-300 text-xs">*next</code> ke node berikutnya.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3 h-3 rounded-full bg-red-500" /><div className="w-3 h-3 rounded-full bg-yellow-500" /><div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="ml-3 text-xs text-slate-500 font-mono">queue_node.cpp</span>
        </div>
        <pre className="text-xs font-mono text-slate-300 overflow-x-auto scrollbar-thin leading-6">
{`struct Node {
    int    queueNumber;
    string name;
    string complaint;
    string status;       // "Reguler" | "IGD"
    Node*  next;         // Pointer ke node berikutnya
};

class Queue {
public:
    Node* head = nullptr;
    Node* tail = nullptr;

    void enqueue(Node* newNode) {
        if (newNode->status == "IGD") {
            newNode->next = head;
            head = newNode;
        } else {
            if (!tail) { head = tail = newNode; return; }
            tail->next = newNode;
            tail = newNode;
        }
    }

    Node* dequeue() {
        if (!head) return nullptr;
        Node* temp = head;
        head = head->next;
        if (!head) tail = nullptr;
        return temp;
    }
};`}
        </pre>
      </div>

      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-cyan-500/10 rounded-xl"><ChevronRight size={20} className="text-cyan-400" /></div>
          <div>
            <h3 className="font-bold text-slate-100">Diagram Linked List Real-time</h3>
            <p className="text-xs text-slate-500">Diperbarui otomatis saat data antrean berubah</p>
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-600">
            <div className="font-mono text-sm bg-slate-800 px-4 py-2 rounded-lg border border-slate-700 mb-3">
              head = <span className="text-violet-400">nullptr</span>; &nbsp; tail = <span className="text-violet-400">nullptr</span>;
            </div>
            <p className="text-sm mt-3">Antrean kosong – tidak ada node di memori</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-3 py-1 rounded-lg">HEAD</span>
              <span className="text-slate-600">→ {queue[0].address}</span>
              <span className="mx-4 text-slate-700">|</span>
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 px-3 py-1 rounded-lg">TAIL</span>
              <span className="text-slate-600">→ {queue[queue.length - 1].address}</span>
            </div>
            <div className="overflow-x-auto scrollbar-thin pb-4">
              <div className="flex items-center gap-0 min-w-max">
                <div className="flex flex-col items-center mr-1">
                  <div className="text-[10px] font-bold text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded mb-2">HEAD</div>
                  <div className="text-emerald-400 text-lg">↓</div>
                </div>
                {queue.map((patient, idx) => (
                  <LinkedListNode key={patient.id} patient={patient}
                    isHead={idx === 0} isTail={idx === queue.length - 1}
                    nextAddress={idx < queue.length - 1 ? queue[idx + 1].address : null} />
                ))}
                <div className="flex items-center">
                  <div className="flex items-center justify-center w-20 h-28 bg-slate-800/40 border-2 border-dashed border-slate-700 rounded-xl ml-2">
                    <span className="text-slate-600 font-mono text-sm font-bold">NULL</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-slate-700/60">
              {[
                { label: 'IGD Node',     color: 'bg-red-500/15 border-red-500/50 text-red-400' },
                { label: 'Reguler Node', color: 'bg-sky-500/15 border-sky-500/50 text-sky-400' },
                { label: 'HEAD Pointer', color: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400' },
                { label: 'TAIL Pointer', color: 'bg-amber-500/15 border-amber-500/50 text-amber-400' },
              ].map(item => (
                <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${item.color}`}>
                  <span className="w-2 h-2 rounded-full bg-current" />{item.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {queue.length > 0 && (
        <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6">
          <h3 className="font-bold text-slate-100 mb-4 flex items-center gap-2"><Hash size={18} className="text-cyan-400" />Tabel Alokasi Memori</h3>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-700">
                  {['Posisi','Alamat (Ptr)','Nama','Status','Keluhan','next →'].map(h => (
                    <th key={h} className="text-left text-slate-500 uppercase tracking-wider pb-3 pr-6 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {queue.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 pr-6">
                      <span className={`px-2 py-0.5 rounded font-bold ${idx === 0 ? 'bg-emerald-500/20 text-emerald-400' : idx === queue.length-1 ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400'}`}>
                        {idx === 0 ? 'HEAD' : idx === queue.length-1 ? 'TAIL' : `[${idx}]`}
                      </span>
                    </td>
                    <td className="py-3 pr-6 text-cyan-400">{p.address}</td>
                    <td className="py-3 pr-6 text-slate-200 font-sans font-semibold">{p.name}</td>
                    <td className="py-3 pr-6"><span className={`px-2 py-0.5 rounded ${p.status==='IGD'?'text-red-400 bg-red-500/10':'text-sky-400 bg-sky-500/10'}`}>{p.status}</span></td>
                    <td className="py-3 pr-6 text-slate-400 font-sans max-w-[180px] truncate">{p.complaint}</td>
                    <td className="py-3 text-violet-400">{idx < queue.length-1 ? queue[idx+1].address : <span className="text-slate-600">nullptr</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function LinkedListNode({ patient, isHead, isTail, nextAddress }) {
  const isIGD = patient.status === 'IGD';
  return (
    <div className="flex items-center">
      <div className={`relative flex flex-col w-44 rounded-xl border-2 overflow-hidden ${isIGD ? 'border-red-500/70 shadow-lg shadow-red-500/20' : 'border-sky-500/50 shadow-lg shadow-sky-500/10'}`}>
        <div className={`px-3 py-1.5 text-center text-[10px] font-bold tracking-wider uppercase ${isIGD ? 'bg-red-500/30 text-red-300' : 'bg-sky-500/20 text-sky-400'}`}>
          {isIGD ? '⚡ IGD NODE' : 'NODE'}
        </div>
        <div className={`px-3 py-3 ${isIGD ? 'bg-red-950/50' : 'bg-slate-800/70'}`}>
          <div className="mb-2"><p className="text-[9px] text-slate-500 uppercase tracking-widest">data.name</p><p className="text-xs font-bold text-slate-100 truncate">{patient.name}</p></div>
          <div className="mb-2"><p className="text-[9px] text-slate-500 uppercase tracking-widest">data.status</p><p className={`text-xs font-bold ${isIGD ? 'text-red-400' : 'text-sky-400'}`}>{patient.status}</p></div>
          <div><p className="text-[9px] text-slate-500 uppercase tracking-widest">this address</p><p className="text-[10px] font-mono text-cyan-400">{patient.address}</p></div>
        </div>
        <div className={`px-3 py-2 border-t ${isIGD ? 'border-red-500/30 bg-red-950/30' : 'border-sky-500/20 bg-slate-900/50'}`}>
          <p className="text-[9px] text-slate-500 uppercase tracking-widest">next*</p>
          <p className="text-[10px] font-mono text-violet-400">{nextAddress || 'nullptr'}</p>
        </div>
        {(isHead || isTail) && (
          <div className={`absolute top-0 right-0 text-[9px] font-bold px-1.5 py-0.5 rounded-bl-lg
            ${isHead && isTail ? 'bg-purple-500/40 text-purple-300' : isHead ? 'bg-emerald-500/30 text-emerald-400' : 'bg-amber-500/30 text-amber-400'}`}>
            {isHead && isTail ? 'H+T' : isHead ? 'HEAD' : 'TAIL'}
          </div>
        )}
      </div>
      {nextAddress && (
        <div className="flex items-center px-1 text-slate-500">
          <div className="h-0.5 w-6 bg-gradient-to-r from-violet-500 to-violet-400" />
          <ChevronRight size={16} className="text-violet-400 -ml-1" />
        </div>
      )}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab]     = useState('dashboard');
  const [queue, setQueue] = useState(() => loadLS(LS_QUEUE, []));
  const [rooms, setRooms] = useState(() => loadLS(LS_ROOMS, INITIAL_ROOMS));
  const [logs,  setLogs]  = useState(() => loadLS(LS_LOG,   []));

  useEffect(() => { saveLS(LS_QUEUE, queue); }, [queue]);
  useEffect(() => { saveLS(LS_ROOMS, rooms); }, [rooms]);
  useEffect(() => { saveLS(LS_LOG,   logs);  }, [logs]);

  // ─── Firebase Realtime Sync (Cross-Device: Laptop <-> HP) ─────────────────
  const isRemoteUpdating = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;

    const dataRef = ref(db, 'klinixflow');
    const unsubscribe = onValue(dataRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        isRemoteUpdating.current = true;
        if (Array.isArray(val.queue)) setQueue(val.queue);
        if (Array.isArray(val.rooms)) setRooms(val.rooms);
        if (Array.isArray(val.logs))  setLogs(val.logs);
        setTimeout(() => { isRemoteUpdating.current = false; }, 150);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !db || isRemoteUpdating.current) return;
    try {
      set(ref(db, 'klinixflow'), { queue, rooms, logs });
    } catch (e) {
      console.error('Firebase save error:', e);
    }
  }, [queue, rooms, logs]);

  // ─── Real-Time Cloud Relay (Cross-Device: Laptop <-> HP) ───────────────────
  useEffect(() => {
    const unsubscribe = subscribeCloud((action) => {
      if (action.type === 'ENQUEUE' && action.patient) {
        setQueue((prev) => {
          if (prev.some((p) => p.id === action.patient.id)) return prev;
          return enqueue(prev, action.patient);
        });
        addLog(`Pasien "${action.patient.name}" (${action.patient.status}) didaftarkan via cloud (${action.user || 'HP'}).`);
      } else if (action.type === 'CALL' && action.patient && action.room) {
        setQueue((prev) => prev.filter((p) => p.id !== action.patient.id));
        setRooms((prev) =>
          prev.map((r) => (r.id === action.room.id ? { ...r, patient: action.patient } : r))
        );
        addLog(`Pasien "${action.patient.name}" dipanggil → ${action.room.label}.`);
        speak(`Nomor antrean atas nama ${action.patient.name}, silakan masuk ke ruang periksa`);
      } else if (action.type === 'REMOVE' && action.patientId) {
        setQueue((prev) => removeById(prev, action.patientId));
        if (action.patientName) addLog(`Pasien "${action.patientName}" dihapus.`);
      } else if (action.type === 'FINISH' && action.roomId) {
        setRooms((prev) =>
          prev.map((r) => (r.id === action.roomId ? { ...r, patient: null } : r))
        );
        if (action.roomLabel) addLog(`Pemeriksaan di ${action.roomLabel} selesai.`);
      }
    });

    return () => unsubscribe();
  }, [addLog]);

  // Real-time synchronization across browser tabs (Local Fallback)
  useEffect(() => {
    // 1. Storage event listener (fires in other tabs when localStorage changes)
    const handleStorage = (e) => {
      if (!e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        if (e.key === LS_QUEUE) setQueue(parsed);
        else if (e.key === LS_ROOMS) setRooms(parsed);
        else if (e.key === LS_LOG) setLogs(parsed);
      } catch (err) {
        console.error('Storage sync error:', err);
      }
    };

    window.addEventListener('storage', handleStorage);

    // 2. BroadcastChannel message listener (instant update across open tabs)
    if (syncChannel) {
      syncChannel.onmessage = (e) => {
        const { key, value } = e.data || {};
        if (key === LS_QUEUE && value) setQueue(value);
        else if (key === LS_ROOMS && value) setRooms(value);
        else if (key === LS_LOG && value) setLogs(value);
      };
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const addLog = useCallback((message) => {
    setLogs(prev => [...prev.slice(-99), { message, timestamp: Date.now() }]);
  }, []);

  const handleLogin  = (account) => { setCurrentUser(account); setActiveTab('dashboard'); };
  const handleLogout = () => setCurrentUser(null);

  if (!currentUser) return <LoginScreen onLogin={handleLogin} />;

  const isAdmin = currentUser.role === 'admin';

  const tabs = [
    { id: 'dashboard', label: 'Dashboard Antrean',               icon: LayoutDashboard },
    { id: 'rooms',     label: 'Manajemen Ruangan',               icon: BedDouble },
    ...(isAdmin ? [{ id: 'memory', label: 'Visualisasi Memori (C++)', icon: Cpu }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Navbar */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-sky-400 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/30">
                <Activity size={18} className="text-white" strokeWidth={2.5} />
              </div>
              <div>
                <span className="font-black text-lg text-slate-100 tracking-tight">Klinix</span>
                <span className="font-black text-lg bg-gradient-to-r from-sky-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">Flow</span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 ml-2 bg-slate-800/60 border border-slate-700/60 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-slate-400 font-medium">Cloud Sync Aktif (Laptop ⇄ HP)</span>
              </div>
            </div>

            {/* Right */}
            <div className="flex items-center gap-3">
              {/* Mobile queue count */}
              <span className="flex sm:hidden bg-sky-500/20 border border-sky-500/40 text-sky-400 text-xs font-bold px-3 py-1.5 rounded-full">
                {queue.length} antrean
              </span>

              {/* Desktop stats */}
              <div className="hidden sm:flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-slate-500">Total Antrean</p>
                  <p className="text-sm font-bold text-slate-200">{queue.length} pasien</p>
                </div>
                <div className="h-8 w-px bg-slate-700" />
                <div className="text-right">
                  <p className="text-xs text-slate-500">IGD Aktif</p>
                  <p className="text-sm font-bold text-red-400">{queue.filter(p => p.status==='IGD').length} pasien</p>
                </div>
                <div className="h-8 w-px bg-slate-700" />
              </div>

              {/* User chip + logout */}
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col items-end leading-tight">
                  <span className="text-xs font-bold text-slate-200">{currentUser.username}</span>
                  <RoleBadge role={currentUser.role} />
                </div>
                <button onClick={handleLogout} title="Keluar"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-700/60 hover:border-red-500/30 transition-colors text-xs font-semibold">
                  <LogOut size={15} />
                  <span className="hidden sm:inline">Keluar</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-0 overflow-x-auto scrollbar-thin">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-all duration-200 flex-shrink-0
                    ${active ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'}`}>
                  <Icon size={16} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.id === 'dashboard' ? 'Antrean' : tab.id === 'rooms' ? 'Ruangan' : 'Memori'}</span>
                  {tab.id === 'dashboard' && queue.length > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-400'}`}>{queue.length}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'dashboard' && <DashboardTab queue={queue} setQueue={setQueue} rooms={rooms} setRooms={setRooms} addLog={addLog} currentUser={currentUser} />}
        {activeTab === 'rooms'     && <RoomsTab rooms={rooms} setRooms={setRooms} addLog={addLog} currentUser={currentUser} logs={logs} />}
        {activeTab === 'memory' && isAdmin && <MemoryTab queue={queue} />}
      </main>

      <footer className="border-t border-slate-800/60 mt-16 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <span>KlinixFlow &copy; 2026 — Proyek Struktur Data Universitas</span>
          <span className="font-mono">Queue &amp; Singly Linked List · React + Tailwind CSS</span>
        </div>
      </footer>
    </div>
  );
}
