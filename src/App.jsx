import { useState, useRef, useCallback } from "react";

const GEMINI_API_KEY = "AIzaSyCBJvS-sxFyDSeuRsGXQ4CxTfm2drmGHAk";
const IMAGE_MODEL = "gemini-2.5-flash-preview-04-17";

// ─── Helpers ─────────────────────────────────────────────────────────

async function geminiImageWithRef(prompt, refBase64, refMime) {
  const parts = [];
  if (refBase64) {
    parts.push({ inlineData: { mimeType: refMime || "image/jpeg", data: refBase64 } });
  }
  parts.push({ text: prompt });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageMimeType: "image/png" },
      }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const imgPart = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!imgPart) throw new Error("No se generó imagen");
  return imgPart.inlineData.data;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseSlides(raw) {
  const blocks = raw.split("---").map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const escenaMatch = block.match(/ESCENA:\s*([\s\S]*?)(?=TEXTO:|$)/i);
    const textoMatch = block.match(/TEXTO:\s*([\s\S]*)/i);
    return {
      scene: escenaMatch ? escenaMatch[1].trim() : block,
      text: textoMatch ? textoMatch[1].trim() : "",
    };
  });
}

// ─── Canvas rendering ────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function renderSlide(canvas, bgBase64, textContent, slideIdx, totalSlides, keyword) {
  const ctx = canvas.getContext("2d");
  const W = 1080, H = 1080;
  canvas.width = W;
  canvas.height = H;

  // Draw background image
  if (bgBase64) {
    try {
      const img = await loadImage("data:image/png;base64," + bgBase64);
      const scale = Math.max(W / img.width, H / img.height);
      const sw = img.width * scale, sh = img.height * scale;
      ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh);
    } catch {
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);
  }

  if (!textContent) return canvas.toDataURL("image/png");

  // Parse text lines
  const lines = textContent.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return canvas.toDataURL("image/png");

  // Measure total text block height to position it
  const pad = 60;
  const maxW = W - pad * 2;
  const isFirst = slideIdx === 0;
  const isLast = slideIdx === totalSlides - 1;

  // Title = first line, body = rest
  const title = lines[0];
  const bodyLines = lines.slice(1);

  // Calculate sizes
  const titleSize = isFirst ? 52 : 44;
  const bodySize = 30;
  const titleLeading = titleSize * 1.3;
  const bodyLeading = bodySize * 1.5;

  ctx.font = `bold ${titleSize}px 'Segoe UI', sans-serif`;
  const wrappedTitle = wrapText(ctx, title, maxW - 40);
  ctx.font = `${bodySize}px 'Segoe UI', sans-serif`;
  const wrappedBody = [];
  for (const bl of bodyLines) {
    wrappedBody.push(...wrapText(ctx, bl, maxW - 40));
  }

  const titleBlockH = wrappedTitle.length * titleLeading;
  const bodyBlockH = wrappedBody.length * bodyLeading;
  const gap = bodyLines.length > 0 ? 16 : 0;
  const kwBlockH = (isLast && keyword) ? 90 : 0;
  const totalTextH = titleBlockH + gap + bodyBlockH + kwBlockH;

  // Position text block at bottom with padding
  const blockBottom = H - 50;
  const blockTop = blockBottom - totalTextH - 50;
  const blockY = Math.max(blockTop, 40);

  // Draw frosted dark panel behind text
  const panelPad = 30;
  const panelY = blockY - panelPad;
  const panelH = totalTextH + panelPad * 2 + 20;

  // Gradient panel (more opaque at bottom)
  const panelGrd = ctx.createLinearGradient(0, panelY, 0, panelY + panelH);
  panelGrd.addColorStop(0, "rgba(0,0,0,0.0)");
  panelGrd.addColorStop(0.15, "rgba(0,0,0,0.65)");
  panelGrd.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = panelGrd;
  ctx.fillRect(0, panelY, W, panelH);

  // Accent line
  ctx.fillStyle = "#d4a853";
  ctx.fillRect(pad, blockY - 6, 50, 3);

  // Draw title
  let y = blockY + titleSize;
  ctx.textAlign = "left";
  ctx.font = `bold ${titleSize}px 'Segoe UI', sans-serif`;

  // Text shadow for readability
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  ctx.fillStyle = "#ffffff";
  for (const line of wrappedTitle) {
    ctx.fillText(line, pad + 4, y);
    y += titleLeading;
  }

  // Draw body
  if (wrappedBody.length > 0) {
    y += gap;
    ctx.font = `${bodySize}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    for (const line of wrappedBody) {
      ctx.fillText(line, pad + 4, y);
      y += bodyLeading;
    }
  }

  // CTA keyword box
  if (isLast && keyword) {
    y += 16;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.font = "bold 38px 'Segoe UI', sans-serif";
    const kwText = keyword.toUpperCase();
    const kwMeasure = ctx.measureText(kwText).width + 50;
    const kwH = 56;
    const kwX = pad + 4;

    // Gold box
    ctx.fillStyle = "#d4a853";
    ctx.beginPath();
    ctx.roundRect(kwX, y, kwMeasure, kwH, 8);
    ctx.fill();

    // Text inside
    ctx.fillStyle = "#0a0a0a";
    ctx.textAlign = "left";
    ctx.fillText(kwText, kwX + 25, y + 40);

    // Instruction below
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "22px 'Segoe UI', sans-serif";
    ctx.fillText("↑ Comenta esta palabra", kwX, y + kwH + 28);
  }

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Slide counter
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "16px 'Segoe UI', sans-serif";
  ctx.fillText(`${slideIdx + 1}/${totalSlides}`, W - 30, 30);

  return canvas.toDataURL("image/png");
}

// ─── ZIP ─────────────────────────────────────────────────────────────

function createZip(files) {
  const localFiles = [], centralDir = [];
  let offset = 0;
  for (const file of files) {
    const nb = new TextEncoder().encode(file.name), d = file.data;
    const l = new Uint8Array(30 + nb.length + d.length);
    const lv = new DataView(l.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0,true);
    lv.setUint16(8,0,true);lv.setUint16(10,0,true);lv.setUint16(12,0,true);
    lv.setUint32(14,0,true);lv.setUint32(18,d.length,true);lv.setUint32(22,d.length,true);
    lv.setUint16(26,nb.length,true);lv.setUint16(28,0,true);
    l.set(nb,30);l.set(d,30+nb.length);localFiles.push(l);
    const c = new Uint8Array(46+nb.length), cv = new DataView(c.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);
    cv.setUint16(8,0,true);cv.setUint16(10,0,true);cv.setUint16(12,0,true);
    cv.setUint16(14,0,true);cv.setUint32(16,0,true);cv.setUint32(20,d.length,true);
    cv.setUint32(24,d.length,true);cv.setUint16(28,nb.length,true);cv.setUint16(30,0,true);
    cv.setUint16(32,0,true);cv.setUint16(34,0,true);cv.setUint16(36,0,true);
    cv.setUint32(38,0,true);cv.setUint32(42,offset,true);
    c.set(nb,46);centralDir.push(c);offset+=l.length;
  }
  const cdSize=centralDir.reduce((s,c)=>s+c.length,0);
  const eocd=new Uint8Array(22),ev=new DataView(eocd.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(4,0,true);ev.setUint16(6,0,true);
  ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);
  ev.setUint32(12,cdSize,true);ev.setUint32(16,offset,true);ev.setUint16(20,0,true);
  const zip=new Uint8Array(offset+cdSize+22);let pos=0;
  for(const lf of localFiles){zip.set(lf,pos);pos+=lf.length;}
  for(const cd of centralDir){zip.set(cd,pos);pos+=cd.length;}
  zip.set(eocd,pos);return zip;
}

function b64toU8(b){const n=atob(b),a=new Uint8Array(n.length);for(let i=0;i<n.length;i++)a[i]=n.charCodeAt(i);return a;}

// ─── Styles ──────────────────────────────────────────────────────────

const lbl = { display:"block", marginBottom:8, fontSize:13, color:"#a89870", textTransform:"uppercase", letterSpacing:2 };
const inp = { width:"100%", padding:"12px 14px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(212,168,83,0.2)", borderRadius:8, color:"#e8e0d0", fontSize:15, fontFamily:"inherit", outline:"none", boxSizing:"border-box" };

// ─── App ─────────────────────────────────────────────────────────────

export default function App() {
  const [slideText, setSlideText] = useState("");
  const [keyword, setKeyword] = useState("");
  const [expertPhoto, setExpertPhoto] = useState(null);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [images, setImages] = useState([]);
  const [idx, setIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);

  const parsed = parseSlides(slideText);
  const count = parsed.length;

  const handleUpload = useCallback(async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setExpertPhoto({ base64: await fileToBase64(f), mimeType: f.type, preview: URL.createObjectURL(f) });
  }, []);

  const generate = useCallback(async () => {
    if (count < 2) return;
    setGenerating(true); setImages([]); setIdx(0);
    setTotalSteps(count); setProgress(0);

    const canvas = canvasRef.current || document.createElement("canvas");
    canvasRef.current = canvas;
    const results = [];

    try {
      for (let i = 0; i < parsed.length; i++) {
        const { scene, text } = parsed[i];
        setStatus(`Generando imagen ${i + 1} de ${count}...`);
        setProgress(i);

        let bgBase64 = null;
        const scenePrompt = scene || "professional sales leader in a modern office environment";

        try {
          if (expertPhoto) {
            const prompt = `Generate an image based on this scene description: "${scenePrompt}". The main character in the scene must look exactly like the person in the reference photo — preserve their exact facial features, face shape, and likeness. Place them naturally in the scene. Photorealistic style with cinematic dramatic lighting. Dark moody atmosphere. Square format 1:1. Do NOT include any text, words, letters, numbers, captions, or watermarks in the image.`;
            bgBase64 = await geminiImageWithRef(prompt, expertPhoto.base64, expertPhoto.mimeType);
          } else {
            const prompt = `Generate an image: "${scenePrompt}". Photorealistic with cinematic dramatic lighting. Dark moody atmosphere. Include a professional-looking business person as the main subject if the scene implies one. Square format 1:1. Do NOT include any text, words, letters, numbers, captions, or watermarks in the image.`;
            bgBase64 = await geminiImageWithRef(prompt, null, null);
          }
        } catch (err) {
          console.warn(`Image failed slide ${i + 1}:`, err);
        }

        const dataUrl = await renderSlide(canvas, bgBase64, text, i, count, keyword);
        results.push({ dataUrl, bgBase64, failed: !bgBase64 });
        setImages([...results]);
      }
      setProgress(count);
      const fails = results.filter(r => r.failed).length;
      setStatus(fails ? `Listo — ${fails} imagen${fails>1?"es":""} sin generar (se usó fondo oscuro)` : "¡Carrusel listo!");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }, [parsed, count, keyword, expertPhoto]);

  const retrySlide = useCallback(async (slideIndex) => {
    if (!parsed[slideIndex]) return;
    setGenerating(true);
    setStatus(`Reintentando slide ${slideIndex + 1}...`);
    const { scene, text } = parsed[slideIndex];
    const scenePrompt = scene || "professional sales leader in a modern office";
    const canvas = canvasRef.current || document.createElement("canvas");

    try {
      let bgBase64 = null;
      if (expertPhoto) {
        bgBase64 = await geminiImageWithRef(
          `Generate an image: "${scenePrompt}". Main character must look exactly like the person in the reference photo. Preserve facial features. Photorealistic, cinematic lighting, dark moody. Square 1:1. NO text/words/letters in image.`,
          expertPhoto.base64, expertPhoto.mimeType
        );
      } else {
        bgBase64 = await geminiImageWithRef(
          `Generate an image: "${scenePrompt}". Photorealistic, cinematic, dark moody. Square 1:1. NO text in image.`,
          null, null
        );
      }
      const dataUrl = await renderSlide(canvas, bgBase64, text, slideIndex, count, keyword);
      const updated = [...images];
      updated[slideIndex] = { dataUrl, bgBase64, failed: false };
      setImages(updated);
      setStatus("¡Slide regenerado!");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }, [parsed, count, keyword, expertPhoto, images]);

  const downloadZip = useCallback(() => {
    const files = images.map((img, i) => {
      const b64 = img.dataUrl.split(",")[1];
      return { name: `slide_${String(i+1).padStart(2,"0")}.png`, data: b64toU8(b64) };
    });
    const zip = createZip(files);
    const blob = new Blob([zip], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `carrusel_${Date.now()}.zip`; a.click();
    URL.revokeObjectURL(url);
  }, [images]);

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg, #080808 0%, #0d0d15 40%, #0a0812 100%)", color:"#e8e0d0", fontFamily:"'Segoe UI', system-ui, sans-serif" }}>

      <header style={{ padding:"28px 40px 22px", borderBottom:"1px solid rgba(212,168,83,0.15)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:42, height:42, background:"linear-gradient(135deg, #d4a853, #8a6d2b)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:"bold", color:"#0a0a0a" }}>C</div>
          <div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:"#d4a853", letterSpacing:1 }}>CAROUSEL STUDIO</h1>
            <p style={{ margin:0, fontSize:12, color:"#8a7a5a", letterSpacing:3, textTransform:"uppercase" }}>Generador de carruseles con IA</p>
          </div>
        </div>
      </header>

      <div style={{ display:"flex", minHeight:"calc(100vh - 92px)" }}>
        {/* Left */}
        <div style={{ width:440, padding:"28px", borderRight:"1px solid rgba(212,168,83,0.1)", overflowY:"auto", flexShrink:0 }}>

          {/* Expert */}
          <label style={lbl}>Foto del experto <span style={{ fontSize:11, color:"#6a5f48", textTransform:"none", letterSpacing:0 }}>(opcional)</span></label>
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20, padding:14, background:"rgba(255,255,255,0.02)", border:"1px dashed rgba(212,168,83,0.25)", borderRadius:10 }}>
            {expertPhoto ? (
              <>
                <div style={{ width:60, height:60, borderRadius:"50%", overflow:"hidden", border:"2px solid rgba(212,168,83,0.4)", flexShrink:0 }}>
                  <img src={expertPhoto.preview} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:14, color:"#c9b99a" }}>Foto cargada</p>
                  <p style={{ margin:"4px 0 0", fontSize:12, color:"#6a5f48" }}>Aparecerá como personaje en cada slide</p>
                </div>
                <button onClick={() => { setExpertPhoto(null); if(fileRef.current) fileRef.current.value=""; }} style={{ padding:"6px 12px", background:"rgba(255,80,80,0.1)", border:"1px solid rgba(255,80,80,0.3)", borderRadius:6, color:"#ff6b6b", fontSize:12, cursor:"pointer" }}>✕</button>
              </>
            ) : (
              <div onClick={() => fileRef.current?.click()} style={{ flex:1, textAlign:"center", cursor:"pointer", padding:"8px 0" }}>
                <div style={{ fontSize:28, marginBottom:4, opacity:0.5 }}>📷</div>
                <p style={{ margin:0, fontSize:14, color:"#8a7a5a" }}>Click para subir foto</p>
                <p style={{ margin:"4px 0 0", fontSize:11, color:"#5a5040" }}>El experto será el personaje principal</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUpload} style={{ display:"none" }} />
          </div>

          {/* Slides input */}
          <label style={lbl}>Contenido de los slides</label>
          <div style={{ marginBottom:8, padding:"10px 14px", background:"rgba(212,168,83,0.04)", border:"1px solid rgba(212,168,83,0.12)", borderRadius:8, fontSize:12, color:"#8a7a5a", lineHeight:1.6 }}>
            <strong style={{ color:"#a89870" }}>Formato por slide:</strong><br/>
            <span style={{ color:"#d4a853" }}>ESCENA:</span> descripción de lo que se ve en la imagen<br/>
            <span style={{ color:"#d4a853" }}>TEXTO:</span> texto exacto que va encima<br/>
            Separá slides con <strong style={{ color:"#a89870" }}>---</strong>
          </div>
          <textarea
            value={slideText}
            onChange={(e) => setSlideText(e.target.value)}
            placeholder={`ESCENA: el experto frustrado en una oficina, mirando gráficos que bajan en una pantalla
TEXTO: ¿Tu equipo no cierra ventas?
El problema no son ellos...
---
ESCENA: el experto señalando una pizarra con estadísticas impactantes
TEXTO: El 67% de los vendedores renuncia por mal liderazgo
No es el sueldo. Es cómo los tratan.
---
ESCENA: el experto mirando a cámara con brazos cruzados, seguro de sí mismo
TEXTO: ¿Querés la solución completa?
Comenta CLASE y te envío toda la info`}
            rows={14}
            style={{ ...inp, padding:"14px 16px", resize:"vertical", lineHeight:1.7, fontSize:14 }}
          />

          <div style={{ marginTop:8, fontSize:13, color: count >= 2 ? "#6abf6a" : count === 0 ? "#6a5f48" : "#e85555", display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background: count >= 2 ? "#6abf6a" : count === 0 ? "#4a4535" : "#e85555" }} />
            {count === 0 ? "Escribí el contenido" : `${count} slide${count!==1?"s":""} detectado${count!==1?"s":""}${count < 2 ? " — mínimo 2":""}`}
          </div>

          {/* Keyword */}
          <div style={{ marginTop:18 }}>
            <label style={lbl}>Palabra clave CTA <span style={{ fontSize:11, color:"#6a5f48", textTransform:"none", letterSpacing:0 }}>(opcional)</span></label>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Ej: CLASE" style={inp} />
          </div>

          {/* Generate */}
          <button onClick={generate} disabled={generating || count < 2} style={{
            width:"100%", marginTop:22, padding:"16px",
            background: generating ? "rgba(212,168,83,0.2)" : "linear-gradient(135deg, #d4a853, #a88230)",
            border:"none", borderRadius:10, color: generating ? "#a89870" : "#0a0a0a",
            fontSize:16, fontWeight:700, cursor: generating ? "not-allowed" : "pointer",
            letterSpacing:1, textTransform:"uppercase", transition:"all 0.3s",
          }}>
            {generating ? "Generando..." : `Generar ${count} Slides`}
          </button>

          {generating && (
            <div style={{ marginTop:18 }}>
              <div style={{ height:4, background:"rgba(255,255,255,0.06)", borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", background:"linear-gradient(90deg, #d4a853, #e8c468)", width: totalSteps ? `${(progress/totalSteps)*100}%` : "0%", transition:"width 0.5s ease", borderRadius:2 }} />
              </div>
              <p style={{ marginTop:10, fontSize:13, color:"#8a7a5a" }}>{status}</p>
            </div>
          )}
          {!generating && status && (
            <p style={{ marginTop:14, fontSize:13, color: status.startsWith("Error") ? "#e85555" : status.includes("sin generar") ? "#e8a849" : "#6abf6a" }}>{status}</p>
          )}
        </div>

        {/* Right */}
        <div style={{ flex:1, padding:"28px 40px", display:"flex", flexDirection:"column", alignItems:"center" }}>
          {images.length === 0 && !generating && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", color:"#4a4535", textAlign:"center", maxWidth:420 }}>
              <div style={{ fontSize:56, marginBottom:16, opacity:0.3 }}>🎨</div>
              <p style={{ fontSize:18, margin:0 }}>Tu carrusel aparecerá aquí</p>
              <p style={{ fontSize:14, marginTop:10, color:"#3a3525", lineHeight:1.6 }}>
                Usá <strong style={{ color:"#8a7a5a" }}>ESCENA:</strong> para describir la imagen y <strong style={{ color:"#8a7a5a" }}>TEXTO:</strong> para el contenido que va encima. Separá slides con <strong style={{ color:"#8a7a5a" }}>---</strong>
              </p>
            </div>
          )}

          {images.length > 0 && (
            <>
              <div style={{ width:"100%", maxWidth:520, aspectRatio:"1", borderRadius:12, overflow:"hidden", boxShadow:"0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,168,83,0.1)" }}>
                <img src={images[idx]?.dataUrl} alt={`Slide ${idx+1}`} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
              </div>

              <div style={{ display:"flex", alignItems:"center", gap:16, marginTop:20 }}>
                <button onClick={() => setIdx(Math.max(0, idx-1))} disabled={idx===0} style={{ padding:"8px 16px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(212,168,83,0.2)", borderRadius:6, color:"#d4a853", cursor: idx===0?"not-allowed":"pointer", fontSize:18, opacity: idx===0?0.3:1 }}>←</button>
                <span style={{ fontSize:14, color:"#8a7a5a", minWidth:80, textAlign:"center" }}>{idx+1} / {images.length}</span>
                <button onClick={() => setIdx(Math.min(images.length-1, idx+1))} disabled={idx===images.length-1} style={{ padding:"8px 16px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(212,168,83,0.2)", borderRadius:6, color:"#d4a853", cursor: idx===images.length-1?"not-allowed":"pointer", fontSize:18, opacity: idx===images.length-1?0.3:1 }}>→</button>
              </div>

              <div style={{ display:"flex", gap:8, marginTop:16, flexWrap:"wrap", justifyContent:"center" }}>
                {images.map((img, i) => (
                  <button key={i} onClick={() => setIdx(i)} style={{
                    width:60, height:60, padding:0,
                    border: idx===i ? "2px solid #d4a853" : img.failed ? "2px solid rgba(232,168,73,0.3)" : "2px solid rgba(255,255,255,0.08)",
                    borderRadius:8, overflow:"hidden", cursor:"pointer",
                    opacity: idx===i?1:0.6, transition:"all 0.2s", background:"none",
                  }}>
                    <img src={img.dataUrl} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
                  </button>
                ))}
              </div>

              <div style={{ display:"flex", gap:12, marginTop:24, flexWrap:"wrap", justifyContent:"center" }}>
                <button onClick={downloadZip} style={{ padding:"14px 32px", background:"linear-gradient(135deg, #d4a853, #a88230)", border:"none", borderRadius:8, color:"#0a0a0a", fontSize:15, fontWeight:700, cursor:"pointer", letterSpacing:0.5 }}>⬇ Descargar ZIP</button>
                <button onClick={() => retrySlide(idx)} disabled={generating} style={{ padding:"14px 24px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(212,168,83,0.3)", borderRadius:8, color:"#d4a853", fontSize:15, cursor:"pointer" }}>🔄 Regenerar slide {idx+1}</button>
              </div>
            </>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display:"none" }} />
    </div>
  );
}
