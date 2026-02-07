export default function Header() {
  return (
    <header className="border-b border-gray-800">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="text-xl font-bold text-white">{{projectName}}</div>
        <nav className="flex gap-6">
          <a href="/" className="text-gray-300 hover:text-white transition">Home</a>
          <a href="/api/hello" className="text-gray-300 hover:text-white transition">API</a>
        </nav>
      </div>
    </header>
  )
}
