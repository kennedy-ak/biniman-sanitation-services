import type { Driver, DriverDocument, DocumentType } from '@/types'

const REQUIRED: { type: DocumentType; label: string; hint: string }[] = [
  { type: 'national_id', label: 'National ID', hint: 'Ghana Card front' },
  { type: 'driving_license', label: 'Driving licence', hint: 'Must be valid' },
  { type: 'vehicle_registration', label: 'Vehicle registration', hint: 'DVLA roadworthy' },
  { type: 'epa_permit', label: 'EPA permit', hint: 'Liquid waste handling' },
]

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|heif)(\?|$)/i

function isImage(url: string): boolean {
  return IMAGE_EXT.test(url) || /image\/upload\//.test(url) // Cloudinary image URLs
}

function fileExt(url: string): string {
  const m = url.split('?')[0].match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toUpperCase() : 'FILE'
}

interface DriverDocumentsProps {
  driver: Driver
  /** Compact = smaller cards, no missing-slot placeholders. */
  compact?: boolean
}

export function DriverDocuments({ driver, compact = false }: DriverDocumentsProps) {
  const byType = new Map<DocumentType, DriverDocument>(
    driver.documents.map((d) => [d.doc_type, d]),
  )
  const total = REQUIRED.length
  const uploaded = driver.documents.length
  const complete = uploaded >= total

  return (
    <section className="bg-white border border-charcoal/5 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-5 border-b border-charcoal/5 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-bold text-lg">Onboarding documents</h2>
          <p className="text-xs text-charcoal/60 mt-0.5">
            Files uploaded by the driver. Click to open full size.
          </p>
        </div>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
            complete
              ? 'bg-green-100 text-green-700'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
          {uploaded}/{total} {complete ? 'complete' : 'pending'}
        </span>
      </div>

      <div
        className={`p-5 grid gap-4 ${
          compact ? 'grid-cols-2 sm:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-4'
        }`}
      >
        {REQUIRED.map((slot) => {
          const doc = byType.get(slot.type)
          return (
            <DocCard
              key={slot.type}
              label={slot.label}
              hint={slot.hint}
              doc={doc}
              compact={compact}
            />
          )
        })}
      </div>
    </section>
  )
}

function DocCard({
  label,
  hint,
  doc,
  compact,
}: {
  label: string
  hint: string
  doc: DriverDocument | undefined
  compact: boolean
}) {
  if (!doc) {
    return (
      <div
        className={`rounded-xl border-2 border-dashed border-charcoal/15 bg-charcoal/[0.02] grid place-items-center text-center ${
          compact ? 'p-3 min-h-[110px]' : 'p-4 min-h-[160px]'
        }`}
      >
        <div>
          <div className="text-2xl opacity-40">📄</div>
          <div className="mt-1 font-semibold text-sm text-charcoal/70">{label}</div>
          <div className="text-[10px] uppercase tracking-wider text-amber-700 font-bold mt-1">
            Not uploaded
          </div>
        </div>
      </div>
    )
  }

  const image = isImage(doc.file_url)

  return (
    <a
      href={doc.file_url}
      target="_blank"
      rel="noreferrer"
      className="group block rounded-xl border border-charcoal/10 bg-white overflow-hidden hover:border-primary/40 hover:shadow-md transition"
      title={`Open ${label}`}
    >
      <div
        className={`relative bg-charcoal/[0.04] grid place-items-center overflow-hidden ${
          compact ? 'h-24' : 'h-36'
        }`}
      >
        {image ? (
          <img
            src={doc.file_url}
            alt={label}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.02] transition"
          />
        ) : (
          <div className="text-center px-2">
            <div className="text-3xl">📄</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider font-bold text-charcoal/60">
              {fileExt(doc.file_url)}
            </div>
          </div>
        )}
        <span className="absolute top-1.5 right-1.5 bg-green-600 text-white text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full tracking-wider">
          ✓
        </span>
      </div>
      <div className="p-2.5">
        <div className="font-semibold text-sm text-charcoal truncate">{label}</div>
        <div className="text-[10px] text-charcoal/50 mt-0.5">
          {hint} · {new Date(doc.uploaded_at).toLocaleDateString()}
        </div>
      </div>
    </a>
  )
}
