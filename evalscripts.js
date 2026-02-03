// NDVI base para Statistics API (S2L2A). Devuelve 1 banda Float32.
window.EVALSCRIPT_NDVI = `//VERSION=3
function setup(){
  return {
    input:[{bands:["B04","B08","SCL"]}],
    output:{bands:1,sampleType:"FLOAT32"}
  };
}
function clear(s){ return ![8,9,10,11].includes(s.SCL); } // nubes/nieve
function evaluatePixel(s){
  if(!clear(s)) return [NaN];
  const d = s.B08 + s.B04;
  if(d===0) return [NaN];
  return [(s.B08 - s.B04) / d];
}`;

// Si tu código espera este nombre, mapeamos:
window.EVALSCRIPT_INDICES = window.EVALSCRIPT_NDVI;

// Clasificación simple usando la capa SCL de Sentinel-2 L2A (no WorldCover).
// Te devuelve los códigos SCL (0..11) como UINT8 en un TIFF.
window.LULC_EVALSCRIPT = `//VERSION=3
function setup(){
  return {
    input:[{bands:["SCL"]}],
    output:{bands:1,sampleType:"UINT8"}
  };
}
function evaluatePixel(s){
  return [s.SCL];
}
`;
