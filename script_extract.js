// ====== Trackmate ======

// (Opsional) Set worker untuk pdf.js biar gak warning "GlobalWorkerOptions.workerSrc"
if (window.pdfjsLib && (!pdfjsLib.GlobalWorkerOptions.workerSrc || pdfjsLib.GlobalWorkerOptions.workerSrc === '')) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
}

/* ========= HASH UTIL (BARU) ========= */
async function sha256File(file) {
  try {
    const buf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
  } catch {
    // fallback kalau SubtleCrypto gak ada
    return `fz_${file.size}_${file.lastModified}_${Math.random().toString(36).slice(2,10)}`;
  }
}

/* ========= SIDEBAR ========= */
const sidebar   = document.querySelector('.sidebar');
const overlay   = document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-overlay');
const sidebarLinks = document.querySelectorAll('.sidebar a');

function openSidebar() { sidebar.classList.add('visible'); overlay?.classList.add('show'); document.body.style.overflow = 'hidden'; }
function closeSidebar() { sidebar.classList.remove('visible'); overlay?.classList.remove('show'); document.body.style.overflow = ''; }
function toggleSidebar() { sidebar.classList.contains('visible') ? closeSidebar() : openSidebar(); }
window.toggleSidebar = toggleSidebar;

overlay?.addEventListener('click', closeSidebar);
document.addEventListener('click', (e) => {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) return;
  const clickInsideSidebar = sidebar.contains(e.target);
  const clickOnToggle = e.target.closest('.sidebar-toggle-btn');
  if (sidebar.classList.contains('visible') && !clickInsideSidebar && !clickOnToggle) closeSidebar();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sidebar.classList.contains('visible')) closeSidebar(); });
sidebarLinks.forEach(a => a.addEventListener('click', closeSidebar));

document.addEventListener('DOMContentLoaded', function () {
  const title = document.querySelector('.dashboard-header h1')?.textContent?.toLowerCase() || "";
  const body = document.body;
  if (title.includes('trackmate'))      body.setAttribute('data-page', 'trackmate');
  else if (title.includes('appsheet'))  body.setAttribute('data-page', 'appsheet');
  else if (title.includes('serah'))     body.setAttribute('data-page', 'serah');
  else if (title.includes('merge'))     body.setAttribute('data-page', 'merge');
});

/* ========= Query DOM ========= */
const fileInput    = document.getElementById('pdfFile');
const output       = document.getElementById('output');
const copyBtn      = document.getElementById('copyBtn');
const lokasiSelect = document.getElementById('inputLokasi');

// === AUTO-CALIBRATE: cari anchor "Diselesaikan Oleh," dan "Nama & Tanda Tangan" ===
async function autoCalibratePdf(buffer){
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await doc.getPage(1);
  const items = (await page.getTextContent()).items || [];

  // "Diselesaikan Oleh," (kolom tengah)
  let atas = items.find(it => /Diselesaikan\s*Oleh/i.test(it.str));
  if(!atas){
    for(let i=0;i<items.length-1;i++){
      if(/Diselesaikan/i.test(items[i].str) && /Oleh/i.test(items[i+1].str)){ atas = items[i]; break; }
    }
  }
  if (!atas){ try{doc.destroy()}catch{}; return null; }

  const xA = atas.transform[4], yA = atas.transform[5];

  // "Nama & Tanda Tangan" di bawahnya yang se-kolom
  const kandidat = items.filter(it =>
    /Nama\s*&?\s*Tanda\s*&?\s*Tangan/i.test(it.str) && it.transform && it.transform[5] < yA
  );
  let bawah=null, best=Infinity;
  for(const it of kandidat){
    const x = it.transform[4], y = it.transform[5];
    const dx=Math.abs(x-xA), dy=Math.max(0,yA-y);
    const score = 1.6*dx + dy;
    if (dx <= 120 && score < best){ best = score; bawah = it; }
  }

  // titik dasar (x,y) untuk nama
  let x = xA + 95;
  let y = bawah ? (bawah.transform[5] + 12) : (yA - 32);

  // (opsional) info baris UK & SOLUSI – bisa dipakai nanti, tidak wajib
  const first = r => items.find(it => r.test(it.str));
  const labUK = first(/Unit\s*Kerja/i), labKC = first(/Kantor\s*Cabang/i);
  let linesUK = 0;
  if (labUK && labKC){
    const yTop = labUK.transform[5], yBot = labKC.transform[5]-1;
    const xL = labUK.transform[4] + 40, xR = xL + 260;
    const ys=[];
    for(const it of items){
      if(!it.transform) continue;
      const x0=it.transform[4], y0=it.transform[5];
      if (y0<=yTop+2 && y0>=yBot-2 && x0>=xL && x0<=xR){
        const yy = Math.round(y0/2)*2;
        if(!ys.some(v=>Math.abs(v-yy)<2)) ys.push(yy);
      }
    }
    linesUK = Math.max(1, Math.min(5, ys.length||0));
  }

  const labSol = first(/Solusi\/?Perbaikan/i), labStatus = first(/Status\s*Pekerjaan/i);
  let linesSOL = 0;
  if (labSol && labStatus){
    const yTop = labSol.transform[5] + 1, yBot = labStatus.transform[5] + 2;
    const xL = labSol.transform[4] + 120, xR = xL + 300;
    const ys=[];
    for(const it of items){
      if(!it.transform) continue;
      const x0=it.transform[4], y0=it.transform[5];
      if (y0>=yBot && y0<=yTop && x0>=xL && x0<=xR){
        const yy = Math.round(y0/2)*2;
        if(!ys.some(v=>Math.abs(v-yy)<2)) ys.push(yy);
      }
    }
    linesSOL = Math.max(1, Math.min(6, ys.length||0));
  }

  try{ doc.destroy() }catch{}
  return { x, y, linesUK, linesSOL, dx:0, dy:0, v:1 };
}

/* ========= IndexedDB ========= */
const DB_NAME = "PdfStorage";
const DB_VERSION = 1;
const STORE_NAME = "pdfs";
let db;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = (event) => { db = event.target.result; resolve(db); };
    request.onerror   = (event) => { console.error("IndexedDB error:", event.target.errorCode); reject(event.target.errorCode); };
  });
}

// (BARU) simpan sambil titip contentHash, tanpa ubah skema store
async function savePdfToIndexedDB_keepSchema(fileOrBlob, { contentHash } = {}) {
  const blob = fileOrBlob instanceof Blob ? fileOrBlob : null;
  if (!blob) throw new Error('savePdfToIndexedDB: argumen harus File/Blob');
  if (blob.type !== 'application/pdf') throw new Error('Type bukan PDF');
  if (!blob.size) throw new Error('PDF kosong');

  // === tambahkan ini ===
  let meta = null;
  try {
    const buf = await blob.arrayBuffer();
    meta = await autoCalibratePdf(buf);
  } catch (e) {
    console.warn('autoCalibrate gagal:', e);
  }

  const database = await openDb();
  await new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_NAME], 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Tx error'));
    tx.objectStore(STORE_NAME).add({
      name: fileOrBlob.name || '(tanpa-nama)',
      dateAdded: new Date().toISOString(),
      data: blob,
      contentHash: contentHash || null,
      meta                                          // ← simpan di sini
    });
  });
  console.log(`✅ Tersimpan: ${fileOrBlob.name} (${(blob.size/1024).toFixed(1)} KB), meta:`, meta);
}


/* ========= Helpers ========= */
const clean = (x) => String(x || '')
  .replace(/[\u00A0\u2007\u202F]/g, ' ')  // NBSP family -> spasi biasa
  .replace(/\u00C2/g, '')                 // buang 'Â' sisa decode
  .replace(/\s+/g, ' ')
  .trim();
function stripLeadingColon(s) { return (s || '').replace(/^\s*:+\s*/, ''); }
function formatTanggalIndonesia(tanggal) {
  if (!tanggal) return '-';
  const bulan = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  const [dd, mm, yyyy] = tanggal.split('/');
  return `${dd} ${bulan[parseInt(mm,10)-1]} ${yyyy}`;
}
function extractFlexibleBlock(lines, startLabel, stopLabels = []) {
  const norm = s => (s || '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')   // NBSP family -> space
    .replace(/\s+/g, ' ')
    .trim();

  const text = (lines || []).map(x => x || '').join('\n');

  const startRe = new RegExp(`${startLabel}\\s*:\\s*`, 'i');
  const mStart  = startRe.exec(text);
  if (!mStart) return '';

  const tail = text.slice(mStart.index + mStart[0].length);

  const stopParts = [];
  for (const lbl of stopLabels) stopParts.push(`${lbl}\\s*:\\s*`);
  if (stopLabels.some(s => /^tanggal$/i.test(s))) {
    stopParts.push(`Tanggal(?:\\s*Tiket)?\\s+\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}`);
  }
  if (stopLabels.some(s => /^kantor\\s*cabang$/i.test(s))) {
    stopParts.push(`(?<!^)Kantor\\s*Cabang(?!\\s*:)`);
  }
  stopParts.push(`[\\r\\n]+[A-Za-z][A-Za-z/() ]+\\s*:\\s*`);

  const stopPattern = stopParts.join('|');
  const cutRe = new RegExp(`([\\s\\S]*?)(?=${stopPattern})`, 'i');
  const mCut  = cutRe.exec(tail);
  const captured = mCut ? mCut[1] : tail;

  return norm(captured);
}

/* ========= State ========= */
let unitKerja = "-", kantorCabang = "-", tanggalFormatted = "-", tanggalRaw = "",
    problem = "-", berangkat = "-", tiba = "-", mulai = "-", selesai = "-",
    solusi = "-", jenisPerangkat = "-", serial = "-", merk = "-", type = "-",
    pic = "-", status = "-";

/* ========= Events ========= */
lokasiSelect?.addEventListener("change", updateOutput);

fileInput?.addEventListener('change', async function () {
  const file = fileInput.files[0];
  if (!file || file.type !== 'application/pdf') return;

  const reader = new FileReader();
  reader.onload = async function () {
    try {
      const typedarray = new Uint8Array(reader.result);
      const pdf = await pdfjsLib.getDocument(typedarray).promise;

      let rawText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        rawText += content.items.map(item => item.str).join('\n') + '\n';
      }

      const lines = rawText.split('\n');

      unitKerja       = stripLeadingColon(extractFlexibleBlock(lines,'Unit Kerja',['Kantor Cabang','Tanggal']) || '-');
      kantorCabang    = stripLeadingColon(extractFlexibleBlock(lines,'Kantor Cabang',['Tanggal','Pelapor']) || '-');
      tanggalRaw      = rawText.match(/Tanggal(?:\sTiket)?\s*:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1] || '';
      tanggalFormatted= tanggalRaw ? formatTanggalIndonesia(tanggalRaw) : '-';
      problem         = extractFlexibleBlock(lines,'Trouble Dilaporkan',['Masalah','Solusi','Progress']) || '-';

      const ambilJam = (text, label) => text.match(new RegExp(`${label}\\s+(\\d{2}:\\d{2})(?::\\d{2})?`))?.[1] || '';
      berangkat = ambilJam(rawText, 'Berangkat') || '-';
      tiba      = ambilJam(rawText, 'Tiba') || '-';
      mulai     = ambilJam(rawText, 'Mulai') || '-';
      selesai   = ambilJam(rawText, 'Selesai') || '-';

      solusi          = extractFlexibleBlock(lines,'Solusi/Perbaikan',['STATUS','Jenis Perangkat','SN','Merk','Type']) || '-';
      jenisPerangkat  = clean(rawText.match(/Jenis Perangkat\s*:\s*(.+)/)?.[1]) || '-';
      serial          = clean(rawText.match(/SN\s*:\s*(.+)/)?.[1]) || '-';
      merk            = clean(rawText.match(/Merk\s*:\s*(.+)/)?.[1]) || '-';
      type            = clean(rawText.match(/Type\s*:\s*(.+)/)?.[1]) || '-';
      (() => {
      // berhenti sebelum label berikutnya
      const stops = [
        'Jabatan','Jenis Perangkat','Serial Number','SN','Merk','Type',
        'Status','STATUS','Tanggal','Nama','Tanda','Cap','Progress',
        'Unit Kerja','Kantor Cabang'
      ];
      // dukung "Pelapor :" ATAU "PIC :"
      const block = extractFlexibleBlock(lines, '(?:Pelapor|PIC)', stops) || '';

      // Format yang didukung: "Nama" atau "Nama (Jabatan)"
      const m = block.match(/^\s*([^()\[\]\n]+?)\s*(?:[\(\[]\s*([^()\[\]]+?)\s*[\)\]])?\s*$/);
      const name = clean(m ? m[1] : block);
      // kalau ada label "Jabatan :" terpisah, angkut juga
      const jab  = clean(m && m[2] ? m[2] : extractFlexibleBlock(lines, 'Jabatan', stops) || '');

      pic = jab ? `${name} (${jab})` : (name || '-');
    })();

      status          = clean(rawText.match(/STATUS PEKERJAAN\s*:\s*(.+)/)?.[1]) || '-';

      updateOutput();
    } catch (err) {
      console.error("Gagal memproses PDF:", err);
      alert("Terjadi kesalahan saat membaca PDF.");
    }
  };
  reader.readAsArrayBuffer(file);
});

/* ========= Output ========= */
function updateOutput() {
  const lokasiTerpilih = lokasiSelect?.value || '';
  const unitKerjaLengkap = (lokasiTerpilih && unitKerja !== '-') ? `${unitKerja} (${lokasiTerpilih})` : unitKerja;

  const finalOutput =
`Selamat Pagi/Siang/Sore Petugas Call Center, Update Pekerjaan

Unit Kerja : ${unitKerjaLengkap}
Kantor Cabang : ${kantorCabang}

Tanggal : ${tanggalFormatted}

Jenis Pekerjaan (Problem) : ${problem}

Berangkat : ${berangkat}
Tiba : ${tiba}
Mulai : ${mulai}
Selesai : ${selesai}

Progress : ${solusi}

Jenis Perangkat : ${jenisPerangkat}
Serial Number : ${serial}
Merk Perangkat : ${merk}
Type Perangkat : ${type}

PIC : ${pic}
Status : ${status}`;

  if (output) output.textContent = finalOutput;
}

/* ========= Copy & Save Histori ========= */
copyBtn?.addEventListener("click", async () => {
  const textarea = document.createElement("textarea");
  textarea.value = output?.textContent || '';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  copyBtn.textContent = "✔ Copied!";
  setTimeout(() => (copyBtn.textContent = "Copy"), 1500);

  const file = fileInput.files[0];
  if (!file) return;

  // === HASH BARU ===
  const contentHash = await sha256File(file);

  const namaUkerBersih = stripLeadingColon(unitKerja) || '-';
  const newEntry = {
    namaUker: namaUkerBersih,
    tanggalPekerjaan: tanggalRaw || '',
    fileName: file.name || '-',
    contentHash,                               // ← identitas isi file
    size: file.size,
    uploadedAt: new Date().toISOString()
  };

  const histori = JSON.parse(localStorage.getItem('pdfHistori')) || [];

  // DEDUPE BERDASARKAN HASH (file identik saja yang diblokir)
  const exists = histori.some(x => x.contentHash === contentHash);

  if (!exists) {
    histori.push(newEntry);
    localStorage.setItem('pdfHistori', JSON.stringify(histori));
    await savePdfToIndexedDB_keepSchema(file, { contentHash }); // Simpan File asli + hash
    showToast(`✔ berhasil disimpan ke histori.`);
  } else {
    showToast(`ℹ sudah ada di histori.`);
  }
});

function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  const remove = () => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); };
  toast.addEventListener('click', remove);
  setTimeout(remove, duration);
}
