import { useState, useEffect } from 'react';
import { api, Item } from './api';

function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    try {
      setLoading(true);
      const data = await api.getItems();
      setItems(data);
      setError(null);
    } catch (err) {
      setError('Failed to load items. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItemName.trim()) return;

    try {
      const newItem = await api.createItem(newItemName.trim());
      setItems([...items, newItem]);
      setNewItemName('');
    } catch (err) {
      setError('Failed to create item');
    }
  }

  async function handleDeleteItem(id: number) {
    try {
      await api.deleteItem(id);
      setItems(items.filter(item => item.id !== id));
    } catch (err) {
      setError('Failed to delete item');
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>{{projectName}}</h1>
        <p className="tagline">{{description}}</p>
      </header>

      <main className="app-main">
        <div className="card">
          <h2>Add Item</h2>
          <form onSubmit={handleAddItem} className="add-form">
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Enter item name..."
            />
            <button type="submit">Add</button>
          </form>
        </div>

        <div className="card">
          <h2>Items ({items.length})</h2>
          
          {error && <div className="error">{error}</div>}
          
          {loading ? (
            <div className="loading">Loading...</div>
          ) : items.length === 0 ? (
            <div className="empty">No items yet. Add one above!</div>
          ) : (
            <ul className="item-list">
              {items.map(item => (
                <li key={item.id} className="item">
                  <span className="item-name">{item.name}</span>
                  <button 
                    className="delete-btn"
                    onClick={() => handleDeleteItem(item.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card info">
          <h2>Stack Info</h2>
          <div className="stack-grid">
            <div className="stack-item">
              <span className="stack-icon">⚛️</span>
              <span>React + TypeScript</span>
            </div>
            <div className="stack-item">
              <span className="stack-icon">🟢</span>
              <span>Express + Node.js</span>
            </div>
            <div className="stack-item">
              <span className="stack-icon">⚡</span>
              <span>Vite Dev Server</span>
            </div>
            <div className="stack-item">
              <span className="stack-icon">🔄</span>
              <span>Hot Reload</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>Created with AgentPrime 🚀</p>
      </footer>
    </div>
  );
}

export default App;
