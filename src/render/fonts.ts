import { openSync, type Font } from 'fontkit'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

export const escapeXml = (value: string): string =>
  value.replace(
    /[<>&"']/g,
    (char) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;'
      })[char]!
  )
const fonts = new Map<string, Font>()
function load(name: string): Font {
  if (!fonts.has(name)) {
    const bundled = new URL(`../assets/fonts/${name}`, import.meta.url)
    const font = openSync(
      fileURLToPath(
        fs.existsSync(bundled)
          ? bundled
          : new URL(`../../assets/fonts/${name}`, import.meta.url)
      )
    )
    if (!('layout' in font)) throw new Error(`Expected a single font: ${name}`)
    fonts.set(name, font)
  }
  return fonts.get(name)!
}

/** All text is outlined. No installed fonts, external CSS or network resources at display time. */
export class Typography {
  private definitions = new Map<string, string>()
  private sans = load('NotoSansCJKsc-Regular.otf')
  private latin = load('Inter.ttf').getVariation({ opsz: 14, wght: 450 })
  private latinBold = load('Inter.ttf').getVariation({ opsz: 14, wght: 700 })
  private serif = load('SourceSerif4Display-Black.otf')
  private chineseSerif = load('NotoSerifCJKsc-SemiBold.otf')

  private font(text: string, display: boolean, bold = false): Font {
    const preferred = display ? this.serif : bold ? this.latinBold : this.latin
    return [...text].every((char) =>
      preferred.hasGlyphForCodePoint(char.codePointAt(0)!)
    )
      ? preferred
      : display
        ? this.chineseSerif
        : this.sans
  }

  width(text: string, size: number, display = false, bold = false): number {
    const font = this.font(text, display, bold)
    return (font.layout(text).advanceWidth * size) / font.unitsPerEm
  }

  fit(
    text: string,
    size: number,
    maxWidth: number,
    display = false,
    bold = false
  ): string {
    if (this.width(text, size, display, bold) <= maxWidth) return text
    const chars = [...text]
    while (
      chars.length &&
      this.width(`${chars.join('')}…`, size, display, bold) > maxWidth
    )
      chars.pop()
    return `${chars.join('')}…`
  }

  text(
    text: string,
    x: number,
    y: number,
    size: number,
    fill: string,
    options: {
      display?: boolean
      bold?: boolean
      maxWidth?: number
      align?: 'left' | 'right'
      shrink?: boolean
    } = {}
  ): string {
    text = text.replace(/[\x00-\x1f\x7f]/g, ' ')
    const display = options.display ?? false
    const bold = options.bold ?? false
    if (options.maxWidth) {
      if (options.shrink)
        size = Math.max(
          size * 0.55,
          Math.min(
            size,
            (size * options.maxWidth) /
              Math.max(1, this.width(text, size, display, bold))
          )
        )
      text = this.fit(text, size, options.maxWidth, display, bold)
    }
    const font = this.font(text, display, bold)
    const run = font.layout(text)
    const scale = size / font.unitsPerEm
    if (options.align === 'right') x -= run.advanceWidth * scale
    let offset = 0
    const parts: string[] = []
    for (let i = 0; i < run.glyphs.length; i++) {
      const glyph = run.glyphs[i]
      const position = run.positions[i]
      const id = `${font === this.serif ? 'd' : font === this.chineseSerif ? 'c' : font === this.latinBold ? 'b' : font === this.latin ? 'l' : 's'}${glyph.id}`
      if (!this.definitions.has(id))
        this.definitions.set(id, `<path id="${id}" d="${glyph.path.toSVG()}"/>`)
      parts.push(
        `<use href="#${id}" transform="translate(${round(x + (offset + position.xOffset) * scale)} ${round(y - position.yOffset * scale)}) scale(${round(scale)} ${round(-scale)})"/>`
      )
      offset += position.xAdvance
    }
    return `<g fill="${fill}" aria-label="${escapeXml(text)}">${parts.join('')}</g>`
  }

  defs(): string {
    return [...this.definitions.values()].join('')
  }
}

export function round(value: number): string {
  return String(Math.round(value * 100000) / 100000)
}
