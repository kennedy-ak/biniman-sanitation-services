import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="max-w-md mx-auto px-6 py-24 text-center">
      <h1 className="text-6xl font-extrabold text-primary">404</h1>
      <p className="mt-4 text-charcoal/70">Page not found.</p>
      <Link to="/" className="mt-6 inline-block text-accent font-semibold">
        Back to home
      </Link>
    </div>
  )
}
