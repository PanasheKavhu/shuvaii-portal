import { bodyParagraphs } from "@/lib/news/links";

/**
 * An announcement's text (D50): paragraphs and line breaks as typed, web
 * addresses as links. Rendered as React text and <a> elements only, never
 * as HTML, so markup in a body shows as the characters typed.
 */
export function AnnouncementBody({ body }: { body: string }) {
  return (
    <div className="flex flex-col gap-4 text-base leading-relaxed break-words">
      {bodyParagraphs(body).map((lines, p) => (
        <p key={p}>
          {lines.map((segments, l) => (
            <span key={l}>
              {l > 0 && <br />}
              {segments.map((s, i) =>
                s.kind === "link" ? (
                  <a
                    key={i}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-primary font-medium break-all underline underline-offset-2"
                  >
                    {s.text}
                  </a>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
