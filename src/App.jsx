import { useState, useRef, useCallback, useEffect } from "react";

// ============================================================
// NANO BANANO CAROUSEL GENERATOR
// Full-stack Instagram carousel generator using Gemini 2.5 Flash
// ============================================================

// --- UTILITY: Convert file to base64 ---
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// --- UTILITY: Download a single image ---
const downloadImage = (dataUrl, filename) => {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- UTILITY: Download all as ZIP using JSZip from CDN ---
const downloadAllAsZip = async (slides) => {
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
  document.head.appendChild(script);
  await new Promise((r) => (script.onload = r));
  const zip = new window.JSZip();
  slides.forEach((s, i) => {
    const base64 = s.imageData.split(",")[1] || s.imageData;
    zip.file(`slide_${i + 1}.png`, base64, { base64: true });
  });
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  downloadImage(url, "carousel_nano_banano.zip");
  URL.revokeObjectURL(url);
};

// --- TEXT SANITIZER: Strips markdown, special chars, and formatting artifacts ---
const sanitizeText = (raw) => {
  return raw
    .replace(/\*\*|__/g, "")           // Remove bold markdown
    .replace(/\*|_/g, "")              // Remove italic markdown
    .replace(/^[-–—•]\s*/gm, "")       // Remove bullet dashes
    .replace(/^#{1,6}\s*/gm, "")       // Remove markdown headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [link text](url) → link text
    .replace(/`/g, "")                 // Remove backticks
    .replace(/\n{3,}/g, "\n\n")        // Collapse excessive newlines
    .trim();
};

// --- REGEX EXTRACTOR: Pulls Texto: and Escena: fields if present ---
const extractFields = (block) => {
  const textoMatch = block.match(/(?:texto|text)\s*:\s*(.+?)(?=(?:escena|scene|contexto|context|estilo|style)\s*:|$)/is);
  const escenaMatch = block.match(/(?:escena|scene)\s*:\s*(.+?)(?=(?:texto|text|contexto|context|estilo|style)\s*:|$)/is);

  if (textoMatch) {
    // Structured format detected — extract only tagged fields
    return {
      displayText: sanitizeText(textoMatch[1].trim()),
      sceneOverride: escenaMatch ? sanitizeText(escenaMatch[1].trim()) : null,
    };
  }

  // No structured tags — treat the whole block as display text
  return {
    displayText: sanitizeText(block.trim()),
    sceneOverride: null,
  };
};

// --- SCRIPT PROCESSOR: Splits the script into narrative segments ---
const processScript = (rawScript, numSlides, keyword) => {
  // Split by double newlines, numbered lines, or "Slide" markers
  const lines = rawScript
    .split(/\n{2,}|(?=^(?:slide|diapositiva|\d+[\.\)\-])\s)/im)
    .map((l) => l.trim())
    .filter(Boolean);

  const segments = [];

  if (lines.length >= numSlides) {
    for (let i = 0; i < numSlides; i++) {
      segments.push(lines[i]);
    }
  } else {
    const words = sanitizeText(rawScript).split(/\s+/);
    const perSlide = Math.ceil(words.length / numSlides);
    for (let i = 0; i < numSlides; i++) {
      segments.push(words.slice(i * perSlide, (i + 1) * perSlide).join(" "));
    }
  }

  // Tag each segment with its narrative role + extract clean text
  return segments.map((rawBlock, i) => {
    const { displayText, sceneOverride } = extractFields(rawBlock);
    let role, placement, sceneHint;

    if (i === 0) {
      role = "HOOK";
      placement = "CENTER";
      sceneHint = "The character is looking directly at the viewer with an intense, provocative expression — raised eyebrow, slight smirk, confrontational energy. Dramatic close-up, dynamic angle from slightly below.";
    } else if (i === numSlides - 1) {
      role = "CTA";
      placement = "CENTER";
      sceneHint = "The character is pointing directly at the viewer with a big confident smile, inviting and energetic body language. Open posture, bright and vibrant background with high energy.";
    } else if (i <= Math.floor(numSlides / 2)) {
      role = "PROBLEM";
      placement = "BOTTOM";
      sceneHint = "The character has a frustrated, disappointed, or concerned facial expression — furrowed brow, maybe arms crossed or palm on forehead. Moody atmospheric lighting, darker tones.";
    } else {
      role = "SOLUTION";
      placement = "TOP";
      sceneHint = "The character is smiling confidently with an 'I've got the answer' expression — finger raised making a point, or gesturing with conviction. Bright uplifting lighting, optimistic atmosphere.";
    }

    // Use scene override from structured input if available
    if (sceneOverride) sceneHint = sceneOverride;

    // Append CTA keyword if missing on last slide
    let finalText = displayText;
    if (role === "CTA" && !finalText.includes(keyword)) {
      finalText = `${finalText}\n\nComenta "${keyword}"`;
    }

    return { index: i, role, text: finalText, placement, sceneHint };
  });
};

// --- STYLE PRESETS ---
const STYLES = {
  gta: {
    label: "GTA V / Novela Gráfica",
    prompt: "Grand Theft Auto V loading screen art style. Hard cel-shading shadows, thick black ink outlines, high contrast, saturated colors, dramatic angles. The character should look like a stylized GTA V cover illustration with bold graphic novel aesthetics.",
    typography: "Use Impact or a bold condensed sans-serif font. ALL CAPS. The text must be WHITE with a thick BLACK outline/stroke around each letter (like meme/YouTube thumbnail style). Do NOT use the GTA stylized cursive font. Use plain, heavy, condensed Impact-style typography for maximum readability.",
  },
  pixar: {
    label: "Pixar / Disney 3D",
    prompt: "Pixar and Disney 3D animated movie style. Smooth digital rendering, slightly exaggerated proportions, big expressive eyes, warm magical lighting with soft ambient glow, subsurface scattering on skin. The character should look like a Pixar movie protagonist — charming, polished, and cinematic.",
    typography: "Use a friendly, rounded bold sans-serif font. White or bright colored text with a soft drop shadow for depth and legibility.",
  },
  retro: {
    label: "Retro Comic 1950s",
    prompt: "Classic 1950s-1960s Marvel/DC comic book style. Visible halftone printing dots (Ben-Day dots), limited vintage color palette (muted reds, yellows, blues), thick black ink outlines, hand-drawn crosshatching, aged paper texture. The character should look like a Golden Age comic book hero illustration.",
    typography: "Use bold comic book caption box typography. Yellow or white text on a rectangular colored caption box, with thick black outlines on the letters, classic comic book style.",
  },
  caricatura: {
    label: "Caricatura",
    prompt: "Exaggerated caricature illustration style. Oversized head with emphasized facial features, expressive cartoon proportions, bold outlines, vibrant flat colors, humorous and dynamic poses. The character should be a recognizable but playfully exaggerated caricature version of the reference person.",
    typography: "Use bold, playful hand-drawn style lettering. Bright colored text with dark outlines, slightly uneven for a fun cartoon feel.",
  },
  libre: {
    label: "🎨 Libre (Subí tu estilo)",
    prompt: "CUSTOM_STYLE",
    typography: "Use Impact or a bold condensed sans-serif font. ALL CAPS. The text must be WHITE with a thick BLACK outline/stroke around each letter for maximum readability.",
  },
};

// ============================================================
// BUILD THE PROMPT FOR EACH SLIDE (NANO BANANO / GEMINI FLASH)
// ARCHITECTURE:
// - The reference photo is used as a MODEL to redraw the person
//   in the selected artistic style (NOT pasted as-is).
// - Scene/style instructions are BACKGROUND context only.
// - RENDER_TEXT is the ONLY text that appears on the image.
// ============================================================
const buildSlidePrompt = (segment, style, totalSlides) => {
  const styleData = STYLES[style] || STYLES.gta;
  const typographyPrompt = styleData.typography;

  // For "libre" style, the visual style comes from the uploaded reference image
  const isLibre = style === "libre";
  const styleInstruction = isLibre
    ? "Match the EXACT artistic style, color palette, rendering technique, and visual mood shown in the SECOND reference image (the style reference). Replicate that style precisely for the entire slide."
    : styleData.prompt;

  const cleanText = segment.text
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return `Generate a 1080x1080 square Instagram carousel slide image.

[CHARACTER DESIGN — USE FIRST REFERENCE IMAGE AS FACE MODEL ONLY]
Study the FIRST reference image (the person's photo) carefully: note their face shape, hairstyle, hair color, skin tone, facial hair, and distinguishing features.
Now REDRAW this person entirely from scratch in the following artistic style: ${styleInstruction}
Do NOT paste, overlay, collage, or photoshop the reference photo into the image. The person must be fully illustrated/rendered in the artistic style — as if an artist drew them from the reference.
The character must be RECOGNIZABLE as the same person but rendered 100% in the chosen art style.

[CHARACTER EXPRESSION & POSE — DO NOT RENDER AS TEXT]
${segment.sceneHint}

[VISUAL COMPOSITION — DO NOT RENDER AS TEXT]
${isLibre ? "Replicate the exact style from the second reference image for backgrounds, lighting, colors, and overall composition." : `Scene style: ${styleInstruction}`}
The entire image (background, character, typography) must be cohesive in the same artistic style.

[TEXT RENDERING — THIS IS THE ONLY TEXT THAT GOES ON THE IMAGE]
RENDER_TEXT: "${cleanText}"
Place this text at the ${segment.placement} of the image.
TYPOGRAPHY STYLE: ${typographyPrompt}

STRICT RULES:
- The character must be DRAWN/ILLUSTRATED in the art style, NOT a real photo.
- ONLY render the exact text inside the RENDER_TEXT quotes on the image.
- Do NOT render any words from the instructions, labels, or section headers.
- Do NOT add slide numbers, counters, or pagination like "1/5".
- The character's facial expression must match the mood of the text.
- Text must be large enough to read on a phone screen.
- The result must look like a premium illustrated Instagram carousel slide.`;
};

// ============================================================
// API CALLER: Sends request to Gemini 2.5 Flash (Nano Banano)
// - First image: expert face reference (for identity)
// - Second image (libre only): style visual reference
// ============================================================
const generateSlide = async (apiKey, referenceImageBase64, segment, style, totalSlides, model, styleRefBase64) => {
  const prompt = buildSlidePrompt(segment, style, totalSlides);

  // Build parts array: expert photo first, then prompt, then optional style ref
  const parts = [
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: referenceImageBase64,
      },
    },
  ];

  // For "libre" style, add the style reference as a second image
  if (style === "libre" && styleRefBase64) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: styleRefBase64,
      },
    });
  }

  parts.push({ text: prompt });

  const requestBody = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  // Use the selected model for the API call
  const modelId = model || "gemini-2.5-flash-image";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API Error (${response.status}): ${err}`);
  }

  const data = await response.json();

  // Extract the generated image from response
  const candidates = data.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
  }

  throw new Error("No image returned from Nano Banano. The model may not have generated an image for this prompt.");
};

// ============================================================
// MAIN APPLICATION COMPONENT
// ============================================================
export default function NanoBananoCarousel() {
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [expertPhoto, setExpertPhoto] = useState(null);
  const [expertPreview, setExpertPreview] = useState(null);
  const [keyword, setKeyword] = useState("");
  const [numSlides, setNumSlides] = useState(5);
  const [script, setScript] = useState("");
  const [style, setStyle] = useState("gta");
  const [styleRefPhoto, setStyleRefPhoto] = useState(null);
  const [styleRefPreview, setStyleRefPreview] = useState(null);
  const [model, setModel] = useState("gemini-2.5-flash-image");
  const [slides, setSlides] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [totalToGenerate, setTotalToGenerate] = useState(0);
  const [error, setError] = useState("");
  const [log, setLog] = useState([]);
  const fileInputRef = useRef(null);
  const styleRefInputRef = useRef(null);
  const cancelRef = useRef(false);

  // Load saved API key from persistent storage on mount
  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get("nano-banano-api-key");
        if (result && result.value) {
          setApiKey(result.value);
          setApiKeySaved(true);
        }
      } catch (e) {
        // No saved key, that's fine
      }
    })();
  }, []);

  // Save API key to persistent storage when it changes
  const handleApiKeyChange = async (newKey) => {
    setApiKey(newKey);
    setApiKeySaved(false);
    if (newKey.trim()) {
      try {
        await window.storage.set("nano-banano-api-key", newKey.trim());
        setApiKeySaved(true);
      } catch (e) {
        // Storage not available, key works for this session only
      }
    }
  };

  const addLog = useCallback((msg) => {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const handleCancel = () => {
    cancelRef.current = true;
    setGenerating(false);
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ⛔ Generación cancelada por el usuario.`]);
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setExpertPhoto(file);
      const url = URL.createObjectURL(file);
      setExpertPreview(url);
    }
  };

  const handleStyleRefUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setStyleRefPhoto(file);
      const url = URL.createObjectURL(file);
      setStyleRefPreview(url);
    }
  };

  const handleGenerate = async () => {
    setError("");
    setLog([]);
    setSlides([]);

    // Validation
    if (!apiKey.trim()) return setError("Ingresa tu API Key de Google AI Studio.");
    if (!expertPhoto) return setError("Sube la foto del experto.");
    if (!keyword.trim()) return setError("Ingresa la palabra clave del CTA.");
    if (!script.trim()) return setError("Pega el guion del carrusel.");
    if (style === "libre" && !styleRefPhoto) return setError("El estilo LIBRE requiere una imagen de referencia visual.");

    setGenerating(true);
    setTotalToGenerate(numSlides);
    setCurrentSlide(0);
    cancelRef.current = false;

    try {
      addLog("Codificando imagen de referencia en Base64...");
      const base64Image = await fileToBase64(expertPhoto);

      let styleRefBase64 = null;
      if (style === "libre" && styleRefPhoto) {
        addLog("Codificando imagen de estilo visual en Base64...");
        styleRefBase64 = await fileToBase64(styleRefPhoto);
      }

      addLog(`Procesando guion en ${numSlides} segmentos narrativos...`);
      const segments = processScript(script, numSlides, keyword);

      segments.forEach((seg, i) => {
        addLog(`  Slide ${i + 1}: [${seg.role}] "${seg.text.substring(0, 50)}..."`);
      });

      // Generate slides sequentially to avoid rate limits
      for (let i = 0; i < segments.length; i++) {
        // Check if user cancelled
        if (cancelRef.current) break;

        setCurrentSlide(i + 1);
        addLog(`Generando Slide ${i + 1}/${numSlides} (${segments[i].role})...`);

        try {
          const imageData = await generateSlide(apiKey, base64Image, segments[i], style, numSlides, model, styleRefBase64);
          if (cancelRef.current) break;
          setSlides((prev) => [
            ...prev,
            {
              index: i,
              role: segments[i].role,
              text: segments[i].text,
              imageData,
            },
          ]);
          addLog(`✓ Slide ${i + 1} generado exitosamente.`);
        } catch (err) {
          if (cancelRef.current) break;
          addLog(`✗ Error en Slide ${i + 1}: ${err.message}`);
          setSlides((prev) => [
            ...prev,
            { index: i, role: segments[i].role, text: segments[i].text, imageData: null, error: err.message },
          ]);
        }

        // Small delay between calls to respect rate limits
        if (i < segments.length - 1 && !cancelRef.current) {
          addLog("Esperando 2s antes de la siguiente llamada...");
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      if (!cancelRef.current) addLog("¡Generación completa!");
    } catch (err) {
      setError(err.message);
      addLog(`ERROR FATAL: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const completedSlides = slides.filter((s) => s.imageData);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(145deg, #0a0a0f 0%, #12121f 40%, #0d1117 100%)",
        color: "#e4e4e7",
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid rgba(139, 92, 246, 0.2)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "rgba(139, 92, 246, 0.03)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 800,
          }}
        >
          🍌
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Nano Banano <span style={{ color: "#8b5cf6" }}>Carousel Generator</span>
          </h1>
          <p style={{ margin: 0, fontSize: 11, color: "#71717a", letterSpacing: "0.05em" }}>
            GEMINI 2.5 FLASH · IMAGE GENERATION · INSTAGRAM CAROUSELS
          </p>
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 69px)" }}>
        {/* ============ LEFT PANEL: CONFIGURATION ============ */}
        <div
          style={{
            width: 380,
            minWidth: 380,
            borderRight: "1px solid rgba(139, 92, 246, 0.15)",
            padding: 20,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* API Key */}
          <FieldGroup label="API Key" sublabel="Google AI Studio">
            <div style={{ position: "relative" }}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="AIza..."
                style={inputStyle}
              />
              {apiKeySaved && apiKey && (
                <span style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 10,
                  color: "#4ade80",
                  fontWeight: 600,
                }}>
                  ✓ Guardada
                </span>
              )}
            </div>
          </FieldGroup>

          {/* Model Selector */}
          <FieldGroup label="Modelo" sublabel="Nano Banano version">
            <select value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle}>
              <option value="gemini-2.5-flash-image">🍌 Nano Banana (gemini-2.5-flash-image)</option>
              <option value="gemini-3.1-flash-image-preview">🍌2 Nano Banana 2 (gemini-3.1-flash-image-preview)</option>
              <option value="gemini-3-pro-image-preview">🍌 Pro (gemini-3-pro-image-preview)</option>
            </select>
          </FieldGroup>

          {/* Expert Photo Upload */}
          <FieldGroup label="Foto del Experto" sublabel="Referencia de identidad para todos los slides">
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed rgba(139, 92, 246, 0.3)",
                borderRadius: 12,
                padding: expertPreview ? 0 : 24,
                textAlign: "center",
                cursor: "pointer",
                overflow: "hidden",
                transition: "border-color 0.2s",
                background: "rgba(139, 92, 246, 0.05)",
                position: "relative",
              }}
            >
              {expertPreview ? (
                <img
                  src={expertPreview}
                  alt="Expert"
                  style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block" }}
                />
              ) : (
                <>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
                  <div style={{ fontSize: 13, color: "#71717a" }}>Click para subir imagen</div>
                  <div style={{ fontSize: 11, color: "#52525b", marginTop: 4 }}>JPG, PNG • Max 10MB</div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                style={{ display: "none" }}
              />
            </div>
          </FieldGroup>

          {/* Keyword + Number of slides row */}
          <div style={{ display: "flex", gap: 12 }}>
            <FieldGroup label="Palabra Clave" sublabel="Para el CTA final" style={{ flex: 1 }}>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Ej: GRATIS"
                style={inputStyle}
              />
            </FieldGroup>
            <FieldGroup label="Slides" sublabel="Cantidad" style={{ width: 90 }}>
              <select value={numSlides} onChange={(e) => setNumSlides(Number(e.target.value))} style={inputStyle}>
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </FieldGroup>
          </div>

          {/* Visual Style */}
          <FieldGroup label="Estilo Visual" sublabel="Estética base de los slides">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {Object.entries(STYLES).map(([key, { label }]) => (
                <button
                  key={key}
                  onClick={() => setStyle(key)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: style === key ? "2px solid #8b5cf6" : "1px solid rgba(255,255,255,0.08)",
                    background: style === key ? "rgba(139, 92, 246, 0.15)" : "rgba(255,255,255,0.03)",
                    color: style === key ? "#c4b5fd" : "#a1a1aa",
                    fontSize: 12,
                    fontWeight: style === key ? 600 : 400,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    textAlign: "left",
                    gridColumn: key === "libre" ? "1 / -1" : "auto",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </FieldGroup>

          {/* Style Reference Upload — only shown when "libre" is selected */}
          {style === "libre" && (
            <FieldGroup label="Referencia Visual" sublabel="Subí una imagen con el estilo que querés replicar">
              <div
                onClick={() => styleRefInputRef.current?.click()}
                style={{
                  border: "2px dashed rgba(236, 72, 153, 0.3)",
                  borderRadius: 12,
                  padding: styleRefPreview ? 0 : 16,
                  textAlign: "center",
                  cursor: "pointer",
                  overflow: "hidden",
                  transition: "border-color 0.2s",
                  background: "rgba(236, 72, 153, 0.05)",
                }}
              >
                {styleRefPreview ? (
                  <img
                    src={styleRefPreview}
                    alt="Style ref"
                    style={{ width: "100%", maxHeight: 140, objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>🎨</div>
                    <div style={{ fontSize: 12, color: "#71717a" }}>Click para subir estilo visual</div>
                  </>
                )}
                <input
                  ref={styleRefInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleStyleRefUpload}
                  style={{ display: "none" }}
                />
              </div>
            </FieldGroup>
          )}

          {/* Script */}
          <FieldGroup label="Guion del Carrusel" sublabel="El texto completo a distribuir en los slides">
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={`Slide 1: ¿Sabías que el 90% de los negocios fracasan en el primer año?\n\nSlide 2: El problema es que nadie te enseña a vender...\n\nSlide 3: Con nuestro método probado vas a...\n\nSlide 4: Más de 500 alumnos ya lo lograron...\n\nSlide 5: Comenta GRATIS y te envío la guía completa`}
              rows={8}
              style={{ ...inputStyle, resize: "vertical", minHeight: 140, lineHeight: 1.5 }}
            />
          </FieldGroup>

          {/* Cost Estimator */}
          {(() => {
            const pricing = {
              "gemini-2.5-flash-image": { perImage: 0.039, label: "Nano Banana" },
              "gemini-3.1-flash-image-preview": { perImage: 0.067, label: "Nano Banana 2" },
              "gemini-3-pro-image-preview": { perImage: 0.134, label: "Nano Banana Pro" },
            };
            const p = pricing[model] || pricing["gemini-2.5-flash-image"];
            const total = (p.perImage * numSlides).toFixed(2);
            const perImg = p.perImage.toFixed(3);
            return (
              <div
                style={{
                  background: "rgba(139, 92, 246, 0.06)",
                  border: "1px solid rgba(139, 92, 246, 0.15)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 11, color: "#a1a1aa" }}>
                  {p.label} · {numSlides} slides · ${perImg}/img
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#c4b5fd" }}>
                  ~${total}
                </span>
              </div>
            );
          })()}

          {/* Generate + Cancel Buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={generating ? handleCancel : handleGenerate}
              style={{
                flex: 1,
                padding: "14px 20px",
                borderRadius: 12,
                border: "none",
                background: generating
                  ? "rgba(139, 92, 246, 0.3)"
                  : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.02em",
                transition: "all 0.2s",
                boxShadow: generating ? "none" : "0 4px 20px rgba(139, 92, 246, 0.3)",
              }}
            >
              {generating ? `Generando Slide ${currentSlide}/${totalToGenerate}...` : "🍌 Generar Carrusel Maestro"}
            </button>
            {generating && (
              <button
                onClick={handleCancel}
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "#f87171",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
              >
                ✕ Cancelar
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12,
                color: "#fca5a5",
              }}
            >
              {error}
            </div>
          )}

          {/* Progress Log */}
          {log.length > 0 && (
            <FieldGroup label="Log de Generación">
              <div
                style={{
                  background: "rgba(0,0,0,0.4)",
                  borderRadius: 8,
                  padding: 12,
                  maxHeight: 180,
                  overflowY: "auto",
                  fontSize: 11,
                  fontFamily: "'SF Mono', 'Fira Code', monospace",
                  lineHeight: 1.7,
                  color: "#a1a1aa",
                }}
              >
                {log.map((l, i) => (
                  <div key={i} style={{ color: l.includes("✓") ? "#4ade80" : l.includes("✗") ? "#f87171" : "#a1a1aa" }}>
                    {l}
                  </div>
                ))}
              </div>
            </FieldGroup>
          )}
        </div>

        {/* ============ RIGHT PANEL: SLIDE VIEWER ============ */}
        <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          {slides.length === 0 && !generating ? (
            <EmptyState />
          ) : (
            <>
              {/* Download All */}
              {completedSlides.length > 1 && (
                <div style={{ marginBottom: 20, display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => downloadAllAsZip(completedSlides)} style={secondaryBtnStyle}>
                    📦 Descargar Todo (ZIP)
                  </button>
                </div>
              )}

              {/* Slides Grid — compact layout, 3 per row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                {slides.map((slide, i) => (
                  <SlideCard key={i} slide={slide} />
                ))}

                {/* Placeholder for slides being generated */}
                {generating &&
                  Array.from({ length: totalToGenerate - slides.length }).map((_, i) => (
                    <div
                      key={`placeholder-${i}`}
                      style={{
                        aspectRatio: "1",
                        borderRadius: 8,
                        border: "1px dashed rgba(139, 92, 246, 0.2)",
                        background: "rgba(139, 92, 246, 0.03)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          border: "2px solid rgba(139, 92, 246, 0.15)",
                          borderTopColor: "#8b5cf6",
                          borderRadius: "50%",
                          animation: "spin 1s linear infinite",
                        }}
                      />
                      <span style={{ fontSize: 10, color: "#52525b" }}>
                        S{slides.length + i + 1}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Spinner keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        input::placeholder, textarea::placeholder { color: #52525b; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.2); border-radius: 3px; }
      `}</style>
    </div>
  );
}

// ============ SUB-COMPONENTS ============

function FieldGroup({ label, sublabel, children, style: wrapperStyle }) {
  return (
    <div style={wrapperStyle}>
      <label style={{ display: "block", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#d4d4d8" }}>{label}</span>
        {sublabel && <span style={{ fontSize: 11, color: "#52525b", marginLeft: 8 }}>{sublabel}</span>}
      </label>
      {children}
    </div>
  );
}

function SlideCard({ slide }) {
  return (
    <div
      style={{
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid rgba(139, 92, 246, 0.15)",
        background: "rgba(255,255,255,0.02)",
        animation: "fadeIn 0.4s ease",
      }}
    >
      {/* Slide header — compact */}
      <div
        style={{
          padding: "4px 8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(139, 92, 246, 0.06)",
          borderBottom: "1px solid rgba(139, 92, 246, 0.1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 3,
              background:
                slide.role === "HOOK"
                  ? "rgba(234, 179, 8, 0.2)"
                  : slide.role === "CTA"
                  ? "rgba(34, 197, 94, 0.2)"
                  : slide.role === "PROBLEM"
                  ? "rgba(239, 68, 68, 0.2)"
                  : "rgba(59, 130, 246, 0.2)",
              color:
                slide.role === "HOOK"
                  ? "#fbbf24"
                  : slide.role === "CTA"
                  ? "#4ade80"
                  : slide.role === "PROBLEM"
                  ? "#f87171"
                  : "#60a5fa",
              letterSpacing: "0.06em",
            }}
          >
            {slide.role}
          </span>
          <span style={{ fontSize: 10, color: "#71717a" }}>S{slide.index + 1}</span>
        </div>
        {slide.imageData && (
          <button
            onClick={() => downloadImage(slide.imageData, `slide_${slide.index + 1}.png`)}
            style={{
              background: "none",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 9,
              color: "#8b5cf6",
              cursor: "pointer",
            }}
          >
            ↓
          </button>
        )}
      </div>

      {/* Slide content */}
      {slide.imageData ? (
        <img src={slide.imageData} alt={`Slide ${slide.index + 1}`} style={{ width: "100%", display: "block" }} />
      ) : slide.error ? (
        <div
          style={{
            aspectRatio: "1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 20, marginBottom: 4 }}>⚠️</div>
            <div style={{ fontSize: 10, color: "#f87171", lineHeight: 1.4 }}>{slide.error}</div>
          </div>
        </div>
      ) : null}

      {/* Text preview — compact */}
      <div
        style={{
          padding: "4px 8px",
          fontSize: 9,
          color: "#71717a",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          lineHeight: 1.3,
          maxHeight: 36,
          overflow: "hidden",
        }}
      >
        {slide.text?.substring(0, 80)}
        {slide.text?.length > 80 ? "..." : ""}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 40,
        opacity: 0.6,
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>🍌</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#d4d4d8" }}>
        Tu carrusel te espera
      </h2>
      <p style={{ fontSize: 13, color: "#71717a", maxWidth: 360, lineHeight: 1.6 }}>
        Configura los parámetros a la izquierda: sube la foto del experto, pega tu guion y presiona
        "Generar Carrusel Maestro" para que Nano Banano haga su magia.
      </p>
      <div
        style={{
          marginTop: 24,
          display: "flex",
          gap: 20,
          fontSize: 11,
          color: "#52525b",
        }}
      >
        <div>
          <div style={{ fontSize: 20, marginBottom: 4 }}>📸</div>
          Sube foto
        </div>
        <div style={{ color: "#3f3f46" }}>→</div>
        <div>
          <div style={{ fontSize: 20, marginBottom: 4 }}>📝</div>
          Pega guion
        </div>
        <div style={{ color: "#3f3f46" }}>→</div>
        <div>
          <div style={{ fontSize: 20, marginBottom: 4 }}>🎨</div>
          Genera slides
        </div>
      </div>
    </div>
  );
}

// ============ SHARED STYLES ============

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "#e4e4e7",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
};

const secondaryBtnStyle = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid rgba(139, 92, 246, 0.3)",
  background: "rgba(139, 92, 246, 0.1)",
  color: "#c4b5fd",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
