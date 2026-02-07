import Header from '@/components/Header'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <Header />
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white mb-6">
            Welcome to <span className="text-blue-500">{{projectName}}</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8">
            {{description}}
          </p>
          <div className="flex gap-4 justify-center">
            <a
              href="/api/hello"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Test API →
            </a>
            <a
              href="https://nextjs.org/docs"
              target="_blank"
              className="px-6 py-3 border border-gray-600 text-gray-300 rounded-lg hover:border-gray-500 transition"
            >
              Learn Next.js
            </a>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-2">⚡ Fast</h3>
            <p className="text-gray-400">Built on Next.js 14 with server components for blazing performance.</p>
          </div>
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-2">🎨 Beautiful</h3>
            <p className="text-gray-400">Tailwind CSS for rapid, responsive UI development.</p>
          </div>
          <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-2">🔒 Type Safe</h3>
            <p className="text-gray-400">TypeScript throughout for fewer bugs and better DX.</p>
          </div>
        </div>
      </div>
    </main>
  )
}
