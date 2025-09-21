// ===== FORM SERAH TERIMA (versi meta-anchor) =====
// - 1 dropdown nama
// - Rekap: nama di kolom TTD TEKNISI (tanpa garis)
// - Merge: pakai meta anchor per-file (x,y,dx,dy) dari IndexedDB; fallback ke auto-find
// - Debug marker oranye & console log

/*************************
 *   ELEMENTS & GLOBALS  *
 *************************/
const tbody = document.getElementById('historiBody');
const inputTanggalSerah = document.getElementById('tglSerahTerima');
const btnGenerate = document.getElementById('btnGenerate');
const btnReset = document.getElementById('btnReset');
const selNama = document.getElementById('selNamaTTD');

// Debug flags (boleh dibuat false kalau sudah stabil)
const DEBUG_SHOW_MARKER = false;   // titik oranye
const DEBUG_CONSOLE_LOG = false;   // log stamping & meta

/********************
 *   UI: SPINNER    *
 ********************/
const spinner = document.createElement('div');
spinner.className = 'loading-spinner';
spinner.innerHTML = '<div class="spinner"></div>';
document.body.appendChild(spinner);
spinner.style.display = 'none';
function showSpinner() { spinner.style.display = 'flex'; }
function hideSpinner()  { spinner.style.display = 'none'; }
const style = document.createElement('style');
style.textContent = `
.loading-spinner{position:fixed;inset:0;background:rgba(255,255,255,.7);z-index:9999;display:flex;align-items:center;justify-content:center}
.spinner{width:40px;height:40px;border:4px solid #ccc;border-top-color:#007bff;border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}`;
document.head.appendChild(style);

/********************
 *   SIDEBAR/UX     *
 ********************/
const sidebar   = document.querySelector('.sidebar');
const overlay   = document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-overlay');
const sidebarLinks = document.querySelectorAll('.sidebar a');
function openSidebar(){sidebar.classList.add('visible');overlay?.classList.add('show');document.body.style.overflow='hidden';}
function closeSidebar(){sidebar.classList.remove('visible');overlay?.classList.remove('show');document.body.style.overflow='';}
function toggleSidebar(){sidebar.classList.contains('visible')?closeSidebar():openSidebar();}
window.toggleSidebar = toggleSidebar;
overlay?.addEventListener('click', closeSidebar);
document.addEventListener('click', (e)=>{const isMobile=window.matchMedia('(max-width:768px)').matches;if(!isMobile)return;if(sidebar.classList.contains('visible')&&!sidebar.contains(e.target)&&!e.target.closest('.sidebar-toggle-btn'))closeSidebar();});
document.addEventListener('keydown', e=>{if(e.key==='Escape'&&sidebar.classList.contains('visible'))closeSidebar();});
sidebarLinks.forEach(a=>a.addEventListener('click', closeSidebar));
document.addEventListener('DOMContentLoaded', function () {
  const title = document.querySelector('.dashboard-header h1')?.textContent?.toLowerCase() || "";
  const body = document.body;
  if (title.includes('trackmate')) body.setAttribute('data-page','trackmate');
  else if (title.includes('appsheet')) body.setAttribute('data-page','appsheet');
  else if (title.includes('serah')) body.setAttribute('data-page','serah');
  else if (title.includes('merge')) body.setAttribute('data-page','merge');
});

/********************
 *   UTILITIES      *
 ********************/
const stripLeadingColon = (s) => (s || '').replace(/^\s*:+\s*/, '');
function toNumDateDMY(s){const m=(s||'').match(/(\d{2})\/(\d{2})\/(\d{4})/); if(!m) return 0; const ts=Date.parse(`${m[3]}-${m[2]}-${m[1]}`); return Number.isNaN(ts)?0:ts;}
function formatTanggalSerahForPdf(val){ if(!val||!/^\d{4}-\d{2}-\d{2}$/.test(val)) return '-'; const [y,m,d]=val.split('-'); return `${d}/${m}/${y}`;}
function getPdfHistori(){ const arr=JSON.parse(localStorage.getItem('pdfHistori')||'[]'); return Array.isArray(arr)?arr:[];}
function setPdfHistori(arr){ localStorage.setItem('pdfHistori', JSON.stringify(arr)); }
function showToast(message, duration = 2500) {
  const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message;
  toast.style.cssText='position:fixed;left:50%;top:16px;transform:translateX(-50%);background:#333;color:#fff;padding:8px 12px;border-radius:8px;z-index:99999;opacity:0;transition:.2s';
  document.body.appendChild(toast); setTimeout(()=>toast.style.opacity='1',10);
  const rm=()=>{toast.style.opacity='0'; setTimeout(()=>toast.remove(),200);}; setTimeout(rm,duration); toast.addEventListener('click',rm);
}

/********************
 *   DROPDOWN SAVE  *
 ********************/
const KEY_NAMA='serah_ttd_nama';
function loadNama(){
  // jangan restore dari storage; selalu balik ke default
  if (selNama) { selNama.selectedIndex = 0; selNama.value = ''; }
  // bersihkan sisa lama kalau pernah tersimpan
  localStorage.removeItem(KEY_NAMA);
}

window.addEventListener('pageshow', (e) => {
  const nav = performance.getEntriesByType('navigation')[0];
  if (e.persisted || (nav && nav.type !== 'navigate')) {
    if (selNama) { selNama.selectedIndex = 0; selNama.value = ''; }
  }
});



/********************
 *   TABLE RENDER   *
 ********************/
function collectRowsForPdf(){
  const rows=[];
  document.querySelectorAll('#historiBody tr').forEach((tr,i)=>{
    const cells = tr.querySelectorAll('td'); if(cells.length<6) return;
    const no = cells[0].textContent.trim() || `${i+1}`;
    const cellTanggal = tr.querySelector('.tgl-serah') || cells[1];
    const raw = (cellTanggal?.dataset?.iso || cellTanggal?.textContent || '').trim();
    const tanggalSerah = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? formatTanggalSerahForPdf(raw) : (raw || '-');
    const namaUker = stripLeadingColon(cells[2].textContent.trim() || '-');
    const tanggalPekerjaan = cells[3].textContent.trim() || '-';
    rows.push({ no, tanggalSerah, namaUker, tanggalPekerjaan });
  });
  return rows;
}

function renderTabel(){
  if(!tbody) return;
  let data = getPdfHistori();
  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Belum ada data histori. Unggah PDF di Trackmate atau AppSheet.</td></tr>`;
    return;
  }
  data = data
    .map((it, i) => ({ ...it, _idx: i }))
    .sort((a, b) => {
      const ka = toNumDateDMY(a.tanggalPekerjaan) || Date.parse(a.uploadedAt || 0) || 0;
      const kb = toNumDateDMY(b.tanggalPekerjaan) || Date.parse(b.uploadedAt || 0) || 0;
      if (ka !== kb) return ka - kb;
      return a._idx - b._idx;
    })
    .map((it,i)=>({ ...it, _no: i+1, namaUker: stripLeadingColon(it.namaUker) }));

  tbody.innerHTML = data.map((item, idx)=>`
    <tr data-i="${idx}" data-name="${(item.fileName||'').replace(/"/g,'&quot;')}" data-hash="${item.contentHash||''}">
      <td>${item._no}</td>
      <td contenteditable="true" class="tgl-serah"></td>
      <td>${(item.namaUker || '-').replace(/\s+/g,' ').trim()}</td>
      <td>${item.tanggalPekerjaan || '-'}</td>
      <td>${item.fileName || '-'}</td>
      <td><button class="danger btn-del" data-i="${idx}">Hapus</button></td>
    </tr>
  `).join('');
}

/********************
 *   INDEXEDDB      *
 ********************/
function openDb(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open('PdfStorage',1);
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      if(!db.objectStoreNames.contains('pdfs')) db.createObjectStore('pdfs',{keyPath:'id',autoIncrement:true});
    };
    req.onsuccess=e=>res(e.target.result);
    req.onerror=()=>rej('Gagal buka DB');
  });
}
function clearIndexedDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.deleteDatabase("PdfStorage");
    request.onsuccess=()=>resolve(true);
    request.onerror =()=>reject("Gagal hapus database IndexedDB");
    request.onblocked=()=>reject("Hapus database diblokir oleh tab lain");
  });
}
async function getAllPdfBuffersFromIndexedDB(preferredOrderNames=[]){
  return new Promise((resolve,reject)=>{
    const request = indexedDB.open('PdfStorage',1);
    request.onerror = () => reject('Gagal buka IndexedDB');
    request.onsuccess = async (event)=>{
      try{
        const db = event.target.result;
        const tx = db.transaction(['pdfs'],'readonly');
        const store = tx.objectStore('pdfs');
        const getAllReq = store.getAll();
        getAllReq.onerror = () => reject('Gagal getAll dari objectStore');
        getAllReq.onsuccess = async ()=>{
          const rows = getAllReq.result || [];
          const items=[];
          for(const entry of rows){
            const blob = entry?.data, name = entry?.name || '(tanpa-nama)';
            if(!(blob instanceof Blob) || blob.type!=='application/pdf' || !blob.size){ continue; }
            const buffer = await blob.arrayBuffer();
            items.push({name, buffer, meta: entry?.meta || null, contentHash: entry?.contentHash || null});
          }
          if(Array.isArray(preferredOrderNames) && preferredOrderNames.length){
            items.sort((a,b)=>{ const ia=preferredOrderNames.indexOf(a.name); const ib=preferredOrderNames.indexOf(b.name); return (ia===-1?9e6:ia) - (ib===-1?9e6:ib); });
          }
          resolve(items);
        };
      }catch(e){ reject(e); }
    };
  });
}

/*****************************************
 *   AUTO-ANCHOR (fallback pakai PDF.js) *
 *****************************************/
async function findAnchorsDiselesaikan(buffer){
  if (!window.pdfjsLib) return [];
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const anchors = [];
  for (let p = 1; p <= doc.numPages; p++){
    const page = await doc.getPage(p);
    const items = (await page.getTextContent()).items || [];

    // "Diselesaikan Oleh," (kolom tengah)
    let atas = items.find(it => /Diselesaikan\s*Oleh/i.test(it.str));
    if(!atas){
      for(let i=0;i<items.length-1;i++){
        if(/Diselesaikan/i.test(items[i].str) && /Oleh/i.test(items[i+1].str)){ atas = items[i]; break; }
      }
    }
    if (!atas){ anchors.push(null); continue; }

    const xA = atas.transform[4], yA = atas.transform[5];

    // "Nama & Tanda Tangan" di bawahnya (pilih yang sekolom tengah)
    const kandidat = items.filter(it =>
      /Nama\s*&?\s*Tanda\s*&?\s*Tangan/i.test(it.str) &&
      it.transform && it.transform[5] < yA
    );
    let bawah=null, best=Infinity;
    for(const it of kandidat){
      const x = it.transform[4], y = it.transform[5];
      const dx=Math.abs(x-xA), dy=Math.max(0,yA-y);
      const score = 1.6*dx + dy;
      if (dx <= 120 && score < best){ best = score; bawah = it; }
    }
    // titik dasar: sedikit di atas label kecil; x di pusat kolom tengah
    let x = xA + 95;
    let y = bawah ? (bawah.transform[5] + 12) : (yA - 32);

    anchors.push({ x, y });
  }
  try { doc.destroy && doc.destroy(); } catch {}
  return anchors;
}

/***************************************
 *   GENERATE & MERGE (main function)  *
 ***************************************/
async function generatePdfSerahTerima(){
  const histori=getPdfHistori();
  if(!histori.length){ alert("Histori kosong. Tidak bisa generate PDF."); return; }

  // Ambil pilihan nama
  const namaTeknisi = (selNama?.value || '').trim();
  const namaDiselesaikan = namaTeknisi || '';

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p','mm','a4');
  const rows = collectRowsForPdf();
  if(rows.length===0){ alert('Tidak ada data untuk digenerate.'); return; }

  // --- REKAP ---
  const chunkSize=50, chunks=[];
  for(let i=0;i<rows.length;i+=chunkSize) chunks.push(rows.slice(i,i+chunkSize));

  let globalIndex=0;
  chunks.forEach((chunk,idx)=>{
    if(idx>0) doc.addPage();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFontSize(18); doc.setFont(undefined,'bold');
    doc.text('FORM TANDA TERIMA CM', pageWidth/2, 20, { align:'center' });

    doc.autoTable({
      head:[['NO.','TANGGAL SERAH TERIMA','NAMA UKER','TANGGAL PEKERJAAN']],
      body:chunk.map(r=>{globalIndex+=1; return [r.no||globalIndex, r.tanggalSerah||'-', r.namaUker||'-', r.tanggalPekerjaan||'-'];}),
      startY:28,
      styles:{ fontSize:5, minCellHeight:4, cellPadding:0.5, halign:'center', valign:'middle', lineColor:[0,0,0], lineWidth:.2, textColor:[0,0,0]},
      headStyles:{ fillColor:false, fontSize:7, fontStyle:'bold'},
      bodyStyles:{ fontSize:5, textColor:[0,0,0], lineColor:[0,0,0]},
      columnStyles:{ 0:{cellWidth:10}, 1:{cellWidth:40}, 2:{cellWidth:90}, 3:{cellWidth:40}},
      theme:'grid', margin:{left:15,right:15}
    });

    const yAfter = (doc.lastAutoTable?.finalY || 32) + 3;
    doc.autoTable({
      head:[['TTD TEKNISI','TTD LEADER','TTD CALL CENTER']],
      body:[['','','']],
      startY:yAfter,
      styles:{ fontSize:7, halign:'center', valign:'middle', lineColor:[0,0,0], lineWidth:.2, textColor:[0,0,0]},
      headStyles:{ fontStyle:'bold', fontSize:7, textColor:[0,0,0], fillColor:false, minCellHeight:5},
      bodyStyles:{minCellHeight:24},
      columnStyles:{ 0:{cellWidth:60}, 1:{cellWidth:60}, 2:{cellWidth:60}},
      theme:'grid', margin:{left:15,right:15},
      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        const { cell, column } = data;
        if (column.index === 0) {
          const txt = (namaTeknisi || '').trim();
          if (!txt) return;
          doc.setFontSize(8);
          const yText = cell.y + cell.height - 3.5;
          doc.text(txt, cell.x + cell.width / 2, yText, { align: 'center' });
        }
      }
    });
  });

  // --- jsPDF -> buffer rekap ---
  const mainPdfBlob = doc.output('blob');
  const mainPdfBuffer = await mainPdfBlob.arrayBuffer();

  // --- Ambil file dari IndexedDB (buffer + meta) ---
  const prefer = [...document.querySelectorAll('#historiBody tr')]
    .map(tr => tr.querySelector('td:nth-child(5)')?.textContent?.trim())
    .filter(Boolean);
  const uploadBuffers = await getAllPdfBuffersFromIndexedDB(prefer);

  // --- Merge & Stamping ---
  const mergedPdf = await PDFLib.PDFDocument.create();
  const mainDoc = await PDFLib.PDFDocument.load(mainPdfBuffer);
  const helv = await mergedPdf.embedFont(PDFLib.StandardFonts.Helvetica);
  const mainPages = await mergedPdf.copyPages(mainDoc, mainDoc.getPageIndices());
  mainPages.forEach(p=>mergedPdf.addPage(p));
  let offset = mainPages.length;

  for(const {name, buffer, meta} of uploadBuffers){
    try{
      const donor = await PDFLib.PDFDocument.load(buffer);
      const donorPages = await mergedPdf.copyPages(donor, donor.getPageIndices());

      // fallback: cari anchor otomatis (kalau meta tidak ada)
      let anchors = [];
      try{ anchors = await findAnchorsDiselesaikan(buffer); } catch(e){ anchors = []; }

      donorPages.forEach((pg,i)=>{
        mergedPdf.addPage(pg);
        const page = mergedPdf.getPage(offset + i);
        const sz = page.getSize();

        // baseline fallback
        let x = sz.width * 0.493;
        let y = sz.height * 0.207;

        // 1) Prioritas: META tersimpan saat upload
        if (meta && typeof meta.x==='number' && typeof meta.y==='number') {
          x = meta.x + (meta.dx||0);
          y = meta.y + (meta.dy||0);
        }
        // 2) Jika meta tidak ada, tapi anchor on-the-fly ada → pakai anchor
        else {
          const an = anchors[i];
          if (an && typeof an.x === 'number' && typeof an.y === 'number'){
            x = an.x; y = an.y;
          }
        }
        // ...set x,y dari meta atau anchor...

        // Geser global: negatif = ke kiri, positif = ke kanan
        const GLOBAL_X_BIAS_PT = -55;   // coba -6 s/d -10
        const GLOBAL_Y_BIAS_PT = 3;

        x += GLOBAL_X_BIAS_PT;
        y += GLOBAL_Y_BIAS_PT;


        // Debug marker/log
        if (DEBUG_SHOW_MARKER) {
          page.drawRectangle({ x:x-3, y:y-3, width:6, height:6, color: PDFLib.rgb(1,0.5,0) });
        }
        if (DEBUG_CONSOLE_LOG) {
          console.log('[STAMP]', { page: offset+i+1, file: name, meta, anchor: anchors[i], finalXY:{x,y} });
        }

        // Gambar nama (center)
        const size = 8;
        const text = (namaDiselesaikan || '').trim() || ' ';
        const w = helv.widthOfTextAtSize(text, size) || 0;
        page.drawText(text, {
          x: x - w/2,
          y: Math.max(30, Math.min(y, sz.height - 30)),
          size,
          font: helv,
          color: PDFLib.rgb(0,0,0)
        });
      });

      offset += donorPages.length;
    }catch(e){ console.warn(`❌ Gagal merge/stamp file "${name}"`, e); }
  }

  const mergedBytes = await mergedPdf.save();
  const mergedBlob  = new Blob([mergedBytes], { type:'application/pdf' });

  // download
  const url = URL.createObjectURL(mergedBlob);
  const a = document.createElement('a'); a.href = url; a.download = 'Form CM merged.pdf'; a.click();
  URL.revokeObjectURL(url);
}

/********************
 *   EVENTS         *
 ********************/
inputTanggalSerah?.addEventListener('change', ()=>{
  const iso = inputTanggalSerah.value || '';
  document.querySelectorAll('.tgl-serah').forEach(td=>{
    td.dataset.iso = iso;
    td.textContent = iso ? formatTanggalSerahForPdf(iso) : '';
  });
  btnGenerate.disabled = !iso;
});

tbody?.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.btn-del'); if(!btn) return;
  if(!confirm('Hapus entri ini dari histori?')) return;

  // sinkron tanggal
  const isoNow = inputTanggalSerah?.value || '';
  if (isoNow) document.querySelectorAll('.tgl-serah').forEach(td=>{
    td.dataset.iso = isoNow; td.textContent = formatTanggalSerahForPdf(isoNow);
  });

  const idx = parseInt(btn.dataset.i,10);
  const arr = getPdfHistori();
  if(!Number.isInteger(idx) || idx<0 || idx>=arr.length) return;

  const target = arr[idx];
  const fileNameToDelete = target.fileName;
  const hashToDelete = target.contentHash || '';

  const filtered = arr.filter(r => !(r.fileName === fileNameToDelete && ((hashToDelete ? r.contentHash === hashToDelete : true))));
  setPdfHistori(filtered);

  const db = await openDb();
  await new Promise((resolve) => {
    const tx = db.transaction(['pdfs'],'readwrite');
    const store = tx.objectStore('pdfs');
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = (e)=>{
      const cursor = e.target.result;
      if(cursor){
        const entry = cursor.value || {};
        const nameOK = entry.name === fileNameToDelete;
        const hashOK = hashToDelete ? (entry.contentHash === hashToDelete) : true;
        if(nameOK && hashOK){ cursor.delete(); resolve(); } else { cursor.continue(); }
      } else { resolve(); }
    };
    cursorReq.onerror = ()=>resolve();
  });

  renderTabel();
});

btnReset?.addEventListener('click', async ()=>{
  if(!confirm('Yakin reset semua histori (pdfHistori + IndexedDB)?')) return;
  localStorage.removeItem('pdfHistori');
  try{ await clearIndexedDB(); } catch{}
  if (selNama) { selNama.selectedIndex = 0; selNama.value = ''; }
  localStorage.removeItem(KEY_NAMA);
  renderTabel();
});

window.addEventListener('storage', (e)=>{ if(e.key==='pdfHistori') renderTabel(); });

btnGenerate?.addEventListener('click', async ()=>{
  const tanggalInput = inputTanggalSerah.value;
  if(!tanggalInput){ alert('⚠️ Silakan isi tanggal serah terima terlebih dahulu.'); return; }
  try{ showSpinner(); await generatePdfSerahTerima(); }
  catch(err){ console.error(err); alert('Gagal generate PDF. Pastikan jsPDF, AutoTable, PDF-lib & PDF.js sudah dimuat.'); }
  finally{ hideSpinner(); }
});

document.addEventListener('DOMContentLoaded', ()=>{ renderTabel(); loadNama(); });

/********************
 *   DEBUG HELPER   *
 ********************/
async function debugListPDF(){
  const db = await openDb();
  const tx = db.transaction(['pdfs'],'readonly');
  const store = tx.objectStore('pdfs');
  const req = store.getAll();
  req.onsuccess = ()=>{ console.log('📂 File di IndexedDB:', req.result.map(x=>({
    name:x.name, hash:x.contentHash, meta:x.meta
  }))); };
}
window.debugListPDF = debugListPDF;
