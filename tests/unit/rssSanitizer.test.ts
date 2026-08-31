import { describe, expect, it } from 'vitest'
import { sanitizeRssHtml } from '@/utils/rssSanitizer'

describe('RSS HTML sanitization', () => {
  it('preserves the small formatting allowlist used by article descriptions', () => {
    const input =
      '<p>Release <strong>stable</strong><br><em>today</em></p>' +
      '<ul><li><code>v5.2.3</code></li></ul>' +
      '<ol><li><b>one</b> <i>item</i></li></ol>' +
      '<pre>checksum</pre><blockquote>notes</blockquote>'

    expect(sanitizeRssHtml(input)).toBe(input)
  })

  it('removes scripts, executable attributes, embedded media, and styles', () => {
    const sanitized = sanitizeRssHtml(
      '<p style="color:red">Safe<script>alert(1)</script>' +
        '<img src="x" onerror="alert(2)">' +
        '<a href="https://example.test/release" onclick="steal()" target="_blank" title="Notes">Link</a>' +
        '<svg><a href="https://evil.test">vector</a></svg></p>'
    )

    expect(sanitized).toContain('<p>Safe')
    expect(sanitized).toContain('<a href="https://example.test/release" title="Notes">Link</a>')
    expect(sanitized).not.toMatch(/script|alert|onerror|onclick|style=|target=|<img|<svg/i)
  })

  it('strips dangerous URL protocols while keeping web and relative links', () => {
    const sanitized = sanitizeRssHtml(
      '<a href="javascript:alert(1)">js</a>' +
        '<a href="vbscript:msgbox(1)">vbs</a>' +
        '<a href="data:text/html,bad">data</a>' +
        '<a href="https://example.test/item">https</a>' +
        '<a href="/relative/item">relative</a>'
    )

    expect(sanitized).toContain('<a>js</a>')
    expect(sanitized).toContain('<a>vbs</a>')
    expect(sanitized).toContain('<a>data</a>')
    expect(sanitized).toContain('<a href="https://example.test/item">https</a>')
    expect(sanitized).toContain('<a href="/relative/item">relative</a>')
    expect(sanitized).not.toMatch(/javascript:|vbscript:|data:/i)
  })
})
