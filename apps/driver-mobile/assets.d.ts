/** Metro resolves an image import to an asset id; nothing in the SDK types say so. */
declare module '*.png' {
  const asset: number;
  export default asset;
}
