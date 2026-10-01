'use client';
import { useState, useEffect, useCallback } from 'react';
import './globals.css';

const API_URL = 'http://localhost:4000';

// Curated Unsplash sneaker photos — cycling through these for each pair
const SNEAKER_IMGS = [
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80', // red nike
  'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=600&q=80', // white nike
  'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=600&q=80', // adidas boost
  'https://images.unsplash.com/photo-1584735175315-9d5df23be1c8?w=600&q=80', // orange nike
  'https://images.unsplash.com/photo-1600269452121-4f2416e55c28?w=600&q=80', // colorful
  'https://images.unsplash.com/photo-1620138546344-7b2c38516edf?w=600&q=80', // white on table
  'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&q=80', // nike air max
  'https://images.unsplash.com/photo-1512374382149-233c42b6a83b?w=600&q=80', // dark shoe
  'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=600&q=80', // sneaker hand
  'https://images.unsplash.com/photo-1556906781-9a412961d28c?w=600&q=80', // white hi-top
];

// Fake colorways for visual variety
const COLORWAYS = [
  'Infrared / Black', 'Pure Platinum', 'Triple White', 'Solarized Orange',
  'Deep Royal Blue', 'Volt / Anthracite', 'Gym Red / Summit White',
  'University Gold', 'Smoke Grey', 'Midnight Navy', 'Arctic Pink',
  'Electric Green', 'Wolf Grey', 'Desert Sand', 'Obsidian Blue',
  'Flash Crimson', 'Photo Blue', 'Bronze Eclipse', 'Court Purple', 'Ice Peach',
];

type Pair = { id: number; sku: string; name: string; colorway: string; available_stock: number };
type UserStatus = { purchasesCount: number; activeHold: any | null; queueEntry: any | null };

export default function Home() {
  const [email, setEmail] = useState('');
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [status, setStatus] = useState<UserStatus>({ purchasesCount: 0, activeHold: null, queueEntry: null });
  const [loading, setLoading] = useState(false);
  const [payState, setPayState] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [now, setNow] = useState(Date.now());

  // Tick every second for live countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchInventory = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/inventory`);
      const data = await res.json();
      setPairs(data.pairs || []);
    } catch { /* silently ignore */ }
  }, []);

  // Poll inventory every 3s
  useEffect(() => {
    fetchInventory();
    const t = setInterval(fetchInventory, 3000);
    return () => clearInterval(t);
  }, [fetchInventory]);

  // Poll user status every 1s
  useEffect(() => {
    if (!user) return;
    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/users/${user.id}/status`);
        if (res.ok) setStatus(await res.json());
      } catch { /* ignore */ }
    };
    poll();
    const t = setInterval(poll, 1000);
    return () => clearInterval(t);
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.user) setUser(data.user);
      else alert(data.error || 'Login failed');
    } catch { alert('Cannot reach server. Is the backend running on :4000?'); }
    setLoading(false);
  };

  const handleBuy = async (pairId: number) => {
    if (!user) return;
    try {
      const res = await fetch(`${API_URL}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, pairId }),
      });
      const data = await res.json();
      if (data.error) alert(data.error);
    } catch { alert('Request failed'); }
  };

  const handlePay = async () => {
    if (!status.activeHold || !user) return;
    setPayState('processing');
    // Simulate real-world payment latency (1–3s random)
    const delay = Math.random() * 2000 + 1000;
    setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/payments/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerEventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            userId: user.id,
            holdId: status.activeHold.id,
            eventType: 'payment.succeeded',
            amountCents: 15000,
          }),
        });
        setPayState(res.ok ? 'success' : 'failed');
      } catch {
        setPayState('failed');
      }
      setTimeout(() => setPayState('idle'), 5000);
    }, delay);
  };

  // Countdown helpers
  const getCountdown = (expiresAt: string) => {
    const diff = Math.max(0, new Date(expiresAt).getTime() - now);
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { str: `${m}:${s.toString().padStart(2, '0')}`, pct: (diff / 300000) * 100, urgent: diff < 60000 };
  };

  const initials = (e: string) => e.slice(0, 2).toUpperCase();

  // ── LOGIN ──
  if (!user) {
    return (
      <div className="login-page">
        {/* Left hero */}
        <div className="login-hero">
          <img
            className="login-hero-img"
            src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=85"
            alt="Limited sneaker drop"
          />
          <div className="login-hero-overlay">
            <span className="login-hero-tag">🔥 Live Drop</span>
            <p className="login-hero-text">Only 20 pairs.<br />Don't miss it.</p>
            <p className="login-hero-sub">Limited edition. One-time release. No restocks.</p>
          </div>
        </div>

        {/* Right panel */}
        <div className="login-panel">
          <div className="login-logo">Sneak<span>Drop</span></div>

          <h1>Enter the Drop</h1>
          <p>Join the exclusive sale. Secure your pair before time runs out.</p>

          <div className="login-stats">
            <div className="login-stat-item">
              <div className="login-stat-num">20</div>
              <div className="login-stat-label">Total Pairs</div>
            </div>
            <div className="login-stat-item">
              <div className="login-stat-num">5m</div>
              <div className="login-stat-label">Hold Timer</div>
            </div>
            <div className="login-stat-item">
              <div className="login-stat-num">2x</div>
              <div className="login-stat-label">Max Per User</div>
            </div>
          </div>

          <form onSubmit={handleLogin}>
            <div className="input-group">
              <label>Email Address</label>
              <input
                id="email-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button id="enter-drop-btn" type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Entering…' : '→ Enter the Drop'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── COUNTDOWN SIDEBAR ──
  const holdInfo = status.activeHold ? getCountdown(status.activeHold.expires_at) : null;

  return (
    <div className="app-shell">
      {/* Nav */}
      <nav className="app-nav">
        <div className="nav-logo">Sneak<span>Drop</span></div>
        <div className="nav-right">
          <div className="nav-badge">
            <span className="nav-badge-dot" />
            Live Sale
          </div>
          <div className="nav-user">
            <div className="nav-avatar">{initials(user.email)}</div>
            {user.email}
          </div>
        </div>
      </nav>

      {/* Hero banner */}
      <div className="drop-hero">
        <img
          className="drop-hero-img"
          src="https://images.unsplash.com/photo-1556906781-9a412961d28c?w=1400&q=80"
          alt="Drop banner"
        />
        <div className="drop-hero-content">
          <span className="drop-pill">🔥 Limited Edition Drop</span>
          <h1 className="drop-hero-title">Exclusive Pairs.<br />Zero Restocks.</h1>
          <p className="drop-hero-sub">Each pair is held for 5 minutes. Pay before time runs out or it goes to the next in line.</p>
        </div>
      </div>

      {/* Main layout */}
      <div className="main-layout">
        {/* Left — prominent single product */}
        <div>
          <div className="section-header">
            <h2 className="section-title">The Drop</h2>
            {pairs.length > 0 && (
              <span className="section-count">{pairs[0].available_stock} of 20 available</span>
            )}
          </div>

          {pairs.length > 0 ? (
            (() => {
              const pair = pairs[0];
              const imgUrl = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&q=85';
              const colorway = 'Infrared / Black';
              const hasHold = !!status.activeHold;
              const hasQueue = !!status.queueEntry;
              const maxed = status.purchasesCount >= 2;
              const inStock = pair.available_stock > 0;

              let btnLabel = inStock ? 'Buy Now' : 'Join Waitlist';
              let btnClass = 'shoe-buy-btn';
              let disabled = false;

              if (maxed) { btnLabel = 'Limit Reached'; btnClass += ' disabled-btn'; disabled = true; }
              else if (hasHold || hasQueue) { btnLabel = inStock ? 'Hold Active' : 'In Queue'; btnClass += ' disabled-btn'; disabled = true; }
              else if (inStock) { btnClass += ' can-buy'; }
              else { btnClass += ' can-queue'; }

              return (
                <div className="single-product-card">
                  <div className="single-product-img-wrap">
                    <img
                      className="single-product-img"
                      src={imgUrl}
                      alt={pair.name}
                      loading="lazy"
                    />
                    <span className="shoe-card-sku">{pair.sku}</span>
                    <span className={`shoe-card-stock-badge ${inStock ? 'badge-available' : 'badge-soldout'}`}>
                      {inStock ? `${pair.available_stock} Left` : 'Sold Out'}
                    </span>
                  </div>

                  <div className="single-product-body">
                    <div>
                      <h1 className="single-product-name">{pair.name}</h1>
                      <div className="single-product-colorway">{colorway}</div>
                      <p className="single-product-desc">
                        The highly anticipated release is finally here. Featuring premium materials and exclusive details, this limited drop won't last long. Max 2 per customer.
                      </p>
                    </div>

                    <div className="single-product-footer">
                      <div>
                        <div className="shoe-price">$150</div>
                        <span className="shoe-price-cents">USD · Free Shipping</span>
                      </div>
                      <button
                        id={`buy-btn-${pair.id}`}
                        className={btnClass}
                        onClick={() => !disabled && handleBuy(pair.id)}
                        disabled={disabled}
                      >
                        {btnLabel}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <p>Loading drop details...</p>
          )}
        </div>

        {/* Right — sidebar */}
        <div className="sidebar">

          {/* Purchases tracker */}
          <div className="purchases-card">
            <span className="purchases-label">Your Purchases</span>
            <div className="purchases-pips">
              <div className={`pip ${status.purchasesCount >= 1 ? 'filled' : ''}`} />
              <div className={`pip ${status.purchasesCount >= 2 ? 'filled' : ''}`} />
            </div>
          </div>

          {/* Active hold timer */}
          {holdInfo && (
            <div className="hold-card">
              <div className="hold-card-header">
                <div className="hold-card-tag">Hold Active</div>
                <div className="hold-card-title">Pair Secured — Pay Now</div>
              </div>
              <div className="hold-card-body">
                <div className="countdown-label">Time Remaining</div>
                <div className={`countdown-display ${holdInfo.urgent ? 'urgent' : ''}`}>
                  {holdInfo.str}
                </div>
                <div className="countdown-bar-wrap">
                  <div
                    className={`countdown-bar ${holdInfo.urgent ? 'urgent' : ''}`}
                    style={{ width: `${holdInfo.pct}%` }}
                  />
                </div>

                {payState === 'idle' && (
                  <button id="pay-now-btn" className="pay-btn" onClick={handlePay}>
                    ✓ Pay $150 Now
                  </button>
                )}
                {payState === 'processing' && (
                  <div className="payment-status payment-processing">
                    ⏳ Processing payment<span className="dots" />
                  </div>
                )}
                {payState === 'success' && (
                  <div className="payment-status payment-success">
                    🎉 Payment successful! You own it.
                  </div>
                )}
                {payState === 'failed' && (
                  <div className="payment-status payment-failed">
                    ✗ Payment failed. Try again.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Queue position */}
          {status.queueEntry && !status.activeHold && (
            <div className="queue-card">
              <div className="queue-card-tag">Waitlist Active</div>
              <div className="queue-card-title">You're in line — hang tight</div>
              <div className="queue-position-block">
                <div className="queue-number">#{status.queueEntry.position}</div>
                <div className="queue-label">in the queue</div>
              </div>
              <p className="queue-info">
                When the current holder's 5-minute timer runs out, you'll automatically get the pair.
              </p>
            </div>
          )}

          {/* Empty state */}
          {!status.activeHold && !status.queueEntry && (
            <div className="status-empty-card">
              <span className="status-empty-icon">👟</span>
              <p className="status-empty-text">Click "Buy Now" on a pair to start your 5-minute hold, or join the waitlist if stock runs out.</p>
            </div>
          )}

        </div>
      </div>

      <footer className="app-footer">
        SneakDrop © 2026 · Limited release · All purchases final
      </footer>
    </div>
  );
}
