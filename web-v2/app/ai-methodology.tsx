export default function AiMethodology(){
  return <article id="about-ai" className="panel ai-methodology guide-section">
    <span className="guide-eyebrow">06 / AI STUDY &amp; ASSUMPTIONS</span>
    <h2>AI portfolio methodology</h2>
    <p>What follows Axioma, and what FactorScope assumes.</p>
    <div className="ai-methodology-columns">
      <section><h3>Documented by Axioma</h3><p>The study uses an equal-weighted 35-stock AI basket, with its weighting scheme kept constant over the study period. It reports trailing 250-day factor correlations at weekly intervals and statistical risk decomposition.</p><p>The paper does not specify a daily trading or rebalancing schedule. Equal weights in risk analysis alone do not establish how a cumulative performance series was constructed.</p></section>
      <section><h3>FactorScope reconstruction</h3><p><strong>Daily rebalancing is our assumption.</strong> The overview resets equal weights at each close; those weights earn the next session’s returns. The 32–35-stock coverage adjustment and Yahoo-adjusted price history are our reconstruction choices. Trading costs are excluded.</p><p><strong>Sharpe is calculated by FactorScope.</strong> It is the mean daily return in excess of the BIL cash proxy divided by the sample standard deviation of those excess returns, multiplied by √252 over the displayed period. It is not an Axioma-reported result.</p></section>
    </div>
    <p>The default one-year extraction and 63-session loading half-life are our selected reconstruction specification, not a verified match to Axioma’s proprietary model. The AI basket and model variants were examined retrospectively; the displayed performance is illustrative, not an out-of-sample strategy test.</p>
    <a href="https://www.simcorp.com/resources/insights/white-papers-and-reports/we-found-the-ai-risk-factor" target="_blank" rel="noreferrer">Source: Axioma study, portfolio construction and factor analysis (pp. 3–7) ↗</a>
  </article>;
}
