import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../external/native/', import.meta.url));
const platform = `${process.platform}-${process.arch}`;
Object.assign(process.env, {
  PDFIUM_DYNAMIC_LIB_PATH: `${root}${platform}/lib`, DOCLING_RS_EP: 'cpu', DOCLING_RS_FP32: '1', DOCLING_RS_DEBUG_REGIONS: '1',
  DOCLING_LAYOUT_ONNX: `${root}models/layout_heron.onnx`,
  DOCLING_TABLEFORMER_ENCODER: `${root}models/tableformer/encoder.onnx`,
  DOCLING_TABLEFORMER_DECODER: `${root}models/tableformer/decoder.onnx`,
  DOCLING_TABLEFORMER_BBOX: `${root}models/tableformer/bbox.onnx`,
});
try {
  const native = createRequire(import.meta.url)(`${root}${platform}/docling.node`);
  if (process.argv[2] === '--probe') process.stdout.write(JSON.stringify(native.supportedFormats()));
  else {
    const result = await native.convertFileAsync(process.argv[2], { to: 'json', skipOcr: true, noTextPanels: true, pipeline: 'standard' });
    process.stdout.write(result.content);
  }
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
