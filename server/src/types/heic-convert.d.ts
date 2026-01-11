declare module "heic-convert" {
  const heicConvert: (opts: {
    buffer: Buffer | Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  }) => Promise<Buffer>;
  export default heicConvert;
}

