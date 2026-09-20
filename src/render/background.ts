import fs from 'node:fs'

let encodedArtwork: string | undefined

/** Embed the bundled artwork so GitHub never needs a second image request. */
export function artisticBackground(
  width: number,
  height: number,
  dark: boolean
): { definitions: string; content: string } {
  if (!encodedArtwork) {
    const bundled = new URL(
      '../assets/art/profile-background.png',
      import.meta.url
    )
    const source = fs.existsSync(bundled)
      ? bundled
      : new URL('../../assets/art/profile-background.png', import.meta.url)
    encodedArtwork = fs.readFileSync(source).toString('base64')
  }
  const definitions = dark
    ? '<filter id="art-night" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="-.08 -.16 -.03 0 .30  -.10 -.25 -.04 0 .45  -.06 -.18 -.03 0 .32  0 0 0 1 0"/></filter>'
    : ''
  const bleedX = width * 0.105
  const bleedY = height * 0.117
  const content = `<image x="${-bleedX}" y="${-bleedY}" width="${width + bleedX * 2}" height="${height + bleedY * 2}" preserveAspectRatio="none" href="data:image/png;base64,${encodedArtwork}"${dark ? ' filter="url(#art-night)"' : ''}/>`
  return { definitions, content }
}
