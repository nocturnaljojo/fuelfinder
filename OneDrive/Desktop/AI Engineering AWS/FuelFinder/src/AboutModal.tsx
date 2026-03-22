interface AboutModalProps { onClose: () => void; }

export default function AboutModal({ onClose }: AboutModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="about-modal" onClick={e => e.stopPropagation()}>
        <div className="about-modal-header">
          <div>
            <h2 className="about-modal-title">⛽ FuelFinder</h2>
            <p className="about-modal-tagline">Real-time fuel prices · Free for Australians 🇦🇺</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="about-modal-body">

          {/* About */}
          <section className="about-section">
            <h3 className="about-section-title">About FuelFinder</h3>
            <p className="about-para">
              FuelFinder provides real-time fuel price information at service stations across
              ACT, NSW and Tasmania, accessible on any device — smartphone, tablet or desktop.
            </p>
            <p className="about-para">
              With location services enabled, FuelFinder can determine your approximate position
              and show you the cheapest fuel nearby. Prices are sourced from state government
              fuel-price reporting APIs and refreshed regularly throughout the day.
            </p>
            <p className="about-para">
              <strong>⚠️ Never use your phone while driving.</strong> Traffic penalties may apply.
            </p>
          </section>

          {/* How to use */}
          <section className="about-section">
            <h3 className="about-section-title">How to Use FuelFinder</h3>
            <h4 className="about-subsection">Find cheap fuel near you</h4>
            <ol className="about-list">
              <li>Allow location access when prompted — FuelFinder uses your GPS to centre the map.</li>
              <li>Choose your <strong>Fuel Type</strong> (U91, E10, P95, P98, Diesel…) from the sidebar or the quick-filter bar above the map.</li>
              <li>The map updates instantly — green markers are cheapest, red are most expensive.</li>
              <li>Tap any marker or station row to see full details, price history and directions.</li>
            </ol>

            <h4 className="about-subsection">Search a specific suburb or town</h4>
            <ol className="about-list">
              <li>Type a suburb, town or postcode into the search box in the sidebar.</li>
              <li>Select your location from the dropdown — the map recentres automatically.</li>
              <li>Adjust the <strong>Search Radius</strong> if you want to see a wider or tighter area.</li>
            </ol>

            <h4 className="about-subsection">Scan an area while browsing the map</h4>
            <ol className="about-list">
              <li>Pan or zoom the map to any area you're interested in.</li>
              <li>A <strong>🔍 Scan this area</strong> button appears once you've moved more than 2 km from your current search origin.</li>
              <li>Tap it — FuelFinder reverse-geocodes the map centre and reloads stations for that location.</li>
            </ol>
          </section>

          {/* Price colours */}
          <section className="about-section">
            <h3 className="about-section-title">Price Colour Guide</h3>
            <div className="about-colour-grid">
              <div className="about-colour-item">
                <span className="about-colour-dot" style={{ background: "#22c55e" }} />
                <div>
                  <strong>Green</strong>
                  <p>Cheapest prices in the current results</p>
                </div>
              </div>
              <div className="about-colour-item">
                <span className="about-colour-dot" style={{ background: "#f59e0b" }} />
                <div>
                  <strong>Amber</strong>
                  <p>Mid-range prices</p>
                </div>
              </div>
              <div className="about-colour-item">
                <span className="about-colour-dot" style={{ background: "#ef4444" }} />
                <div>
                  <strong>Red</strong>
                  <p>Most expensive in the current results</p>
                </div>
              </div>
            </div>
            <p className="about-para" style={{ marginTop: 10 }}>
              Colours are relative to the current search results, not absolute prices — so a
              "green" station in a rural area may still be pricier than an "amber" in the city.
            </p>
          </section>

          {/* Leaderboard cards */}
          <section className="about-section">
            <h3 className="about-section-title">Leaderboard Cards</h3>
            <div className="about-leaderboard-guide">
              <div className="about-lb-item"><span>⭐</span><div><strong>Cheapest &amp; Nearest</strong> — scored 60% on price, 40% on distance. The overall best deal.</div></div>
              <div className="about-lb-item"><span>💰</span><div><strong>Cheapest</strong> — lowest raw price, regardless of distance.</div></div>
              <div className="about-lb-item"><span>📍</span><div><strong>Nearest</strong> — closest stations to your location, price shown as secondary.</div></div>
              <div className="about-lb-item"><span>⚠️</span><div><strong>Most Expensive</strong> — worth knowing so you can avoid them.</div></div>
            </div>
          </section>

          {/* Fuel types */}
          <section className="about-section">
            <h3 className="about-section-title">Fuel Types Explained</h3>
            <div className="about-fuel-list">
              {[
                ["U91", "Unleaded 91 — the most common grade for passenger cars in Australia. Standard octane rating of 91."],
                ["E10", "Ethanol 10 — a blend of 90% petrol and 10% ethanol. Slightly lower energy density but often cheaper."],
                ["P95", "Premium 95 — higher octane for smoother engine operation. Better performance and efficiency."],
                ["P98", "Premium 98 — highest octane unleaded. Optimal for performance engines and cleaner combustion."],
                ["Diesel", "Standard petroleum diesel. Only suitable for diesel engine vehicles."],
                ["Premium Diesel", "Enhanced diesel with better lubrication and injector-cleaning detergents for optimal performance."],
                ["LPG", "Liquid Petroleum Gas (propane/butane). Only for vehicles built or modified to use it. Often significantly cheaper per litre."],
              ].map(([type, desc]) => (
                <div key={type} className="about-fuel-item">
                  <span className="about-fuel-tag">{type}</span>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Add to home screen */}
          <section className="about-section">
            <h3 className="about-section-title">Add FuelFinder to Your Home Screen</h3>
            <h4 className="about-subsection">iPhone / iPad (Safari)</h4>
            <ol className="about-list">
              <li>Open <strong>fuelfinder-chi.vercel.app</strong> in Safari.</li>
              <li>Tap the <strong>Share</strong> button (the box with an upward arrow).</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> — the FuelFinder icon will appear on your home screen.</li>
            </ol>
            <h4 className="about-subsection">Android (Chrome)</h4>
            <ol className="about-list">
              <li>Open FuelFinder in Chrome.</li>
              <li>Tap the <strong>three-dot menu</strong> (top right).</li>
              <li>Tap <strong>Add to Home Screen</strong>.</li>
              <li>Confirm — the icon appears on your home screen.</li>
            </ol>
          </section>

          {/* Privacy */}
          <section className="about-section">
            <h3 className="about-section-title">Privacy & Data</h3>
            <p className="about-para">
              FuelFinder uses <strong>Clerk</strong> for optional sign-in (no password required — Google/Apple OAuth).
              Your personal data is never sold or shared. Location access is used only to centre the map and
              calculate distances — it is never stored on our servers.
            </p>
            <p className="about-para">
              Fuel price data is sourced from public government APIs. FuelFinder is an independent
              community project and is not affiliated with any fuel retailer, government body, or
              price-reporting authority.
            </p>
          </section>

        </div>

        <div className="about-modal-footer">
          <button className="about-close-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
