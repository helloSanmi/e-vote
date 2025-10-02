// Additional functionalities to appeal to users and testers
// - Add a "How it Works" page explaining the voting process.
// - Add a "Contact Us" or "Support" page for issues.
// - Integrate a simple "FAQ" section on the homepage or a separate page.
// - Add real-time updates on the vote page (polling backend periodically).
// - Add accessibility improvements (ARIA labels, focus states).

// Example: Add a FAQ page
// frontend/pages/faq.js
export default function FAQ() {
    return (
      <div className="space-y-8">
        <div className="glass-card mx-auto max-w-4xl px-8 py-10 text-center">
          <h1 className="text-3xl font-bold text-slate-900">Frequently Asked Questions</h1>
          <p className="mt-3 text-slate-600">
            Quick answers about how Tech Analytics voters interact with the platform.
          </p>
        </div>

        <div className="mx-auto grid w-full max-w-4xl gap-6">
          {[{
            title: "How does voting work?",
            answer: "Register and log in ahead of any election. Once the period opens, choose your preferred candidate and submit — one verified vote per user."
          }, {
            title: "Can I see past results?",
            answer: "Yes. Head over to the Past Results page to explore the outcome of previous voting sessions you participated in."
          }, {
            title: "Is my vote secure?",
            answer: "Absolutely. Votes are tied to authenticated accounts, stored securely, and only published after the admin releases them."
          }].map(({ title, answer }) => (
            <div key={title} className="glass-card px-6 py-6 text-left">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <p className="mt-3 text-sm text-slate-600">{answer}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
