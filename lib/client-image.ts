export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getViewBoxSize(svg: string): { width: number; height: number } | null {
  const vbMatch = svg.match(/viewBox=["']([^"']+)["']/i);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }
  const wMatch = svg.match(/width=["']([\d.]+)/i);
  const hMatch = svg.match(/height=["']([\d.]+)/i);
  if (wMatch && hMatch) {
    return { width: Number(wMatch[1]), height: Number(hMatch[1]) };
  }
  return null;
}

export function normalizeSvg(svg: string): string {
  const size = getViewBoxSize(svg);
  if (!size) return svg;
  let s = svg;
  if (!/width\s*=/.test(s)) {
    s = s.replace(/<svg/i, `<svg width="${size.width}" height="${size.height}"`);
  }
  if (!s.includes("xmlns=")) {
    s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return s;
}

export async function svgToPngBlob(svgString: string, type: "image/png" | "image/jpeg"): Promise<Blob | null> {
  const svg = normalizeSvg(svgString);
  const size = getViewBoxSize(svg);
  const width = size?.width || 1024;
  const height = size?.height || 1024;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      if (type === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => resolve(b), type, 0.92);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export async function downloadSvg(url: string, filename: string) {
  const res = await fetch(url);
  const text = await res.text();
  const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}

export async function downloadRaster(url: string, filename: string, type: "image/png" | "image/jpeg") {
  const res = await fetch(url);
  const text = await res.text();
  const blob = await svgToPngBlob(text, type);
  if (!blob) throw new Error("Canvas conversion failed");
  downloadBlob(blob, filename);
}
