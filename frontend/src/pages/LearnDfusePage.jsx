import React from 'react';
import { BookOpen, Upload, BarChart2, GitMerge, Sparkles, Settings } from 'lucide-react';

const SECTIONS = [
  {
    title: 'Setup',
    icon: Settings,
    items: [
      {
        title: 'Enter Your Gemini API Key',
        content: [
          'Go to the Settings page via the left navigation.',
          'Paste your Gemini API key in the designated field.',
          'This securely connects Dfuse to your preferred AI service.',
        ],
      },
      {
        title: 'Select Your AI Model',
        content: ['Choose from the available Gemini AI models using the dropdown menu.'],
      },
      {
        title: 'Confirm Your Connection',
        content: [
          'After saving your settings, look for a confirmation message.',
          'This indicates your connection is active and your model is ready for use.',
        ],
      },
      {
        title: 'Track Token Usage',
        content: ['Monitor your AI token consumption directly within the Settings page.'],
      },
    ],
  },
  {
    title: 'Feature 1 — Create Charts Easily',
    icon: BarChart2,
    items: [
      {
        title: 'Upload Your Data',
        content: [
          'Click the Upload Data button on the left action bar of the canvas.',
          'Select and upload your CSV file.',
        ],
      },
      {
        title: 'Select Variables',
        content: [
          'Choose variables from the Variables panel.',
          'You can select a single dimension or measure, or one dimension and one measure together.',
        ],
      },
      {
        title: 'View Your Chart',
        content: ['A chart based on your selected variables automatically appears on the canvas.'],
      },
    ],
    tip: 'You can change the chart\'s aggregation type (Sum, Average, Min, Max) using the menu icon on the chart.',
  },
  {
    title: 'Feature 2 — Fuse Charts Together',
    icon: GitMerge,
    content: [
      'You can fuse two single-variable charts (one dimension + one measure each), or two two-variable charts that share a common variable.',
      'To fuse charts: select two charts by clicking on their titles, then click the Fuse icon on the left action bar.',
      'A fused chart will be created on the canvas. Change its chart type anytime from the top-right corner menu.',
    ],
  },
  {
    title: 'Feature 3 — Ask AI for Insights',
    icon: Sparkles,
    items: [
      {
        title: 'Use AI to Analyze or Transform Data',
        content: [
          'Find the "Explore with AI" box below each chart.',
          'Type a query or command in plain English — e.g., show top 5 products, calculate a metric, filter by a dimension.',
          'Press Enter and AI gives you the answer along with the code.',
        ],
      },
      {
        title: 'Generate AI Insights Instantly',
        content: [
          'Next to the "Explore with AI" box, click the "Insights" button.',
          'Dfuse will automatically generate key patterns, outliers, and smart summaries — no typing needed.',
        ],
      },
    ],
  },
];

function renderContent(lines) {
  return lines.map((line, i) => (
    <p key={i} className="text-sm text-gray-600 leading-relaxed mb-1">
      {line}
    </p>
  ));
}

export default function LearnDfusePage() {
  return (
    <div className="min-h-full bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Learn Dfuse</h1>
        </div>
        <p className="text-gray-500 text-sm ml-12">
          Everything you need to get started with data visualization on the infinite canvas.
        </p>
      </div>

      <div className="px-8 py-8 max-w-4xl">
        {/* Intro */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Welcome to D.Fuse — Your Data Visualization Playground
          </h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-5">
            Transform your data into stunning insights with our AI-powered platform —
            infinite canvas, AI-powered insights, smart chart fusion, and effortless reporting.
          </p>

          {/* Video embed */}
          <div className="rounded-lg overflow-hidden" style={{ aspectRatio: '16/9', maxWidth: '640px' }}>
            <iframe
              width="100%"
              height="100%"
              src="https://www.youtube.com/embed/rDHrFO6vyCE?si=YUNiEx5C_p3rnBt7&controls=0"
              title="D.Fuse walkthrough"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>

        {/* Feature sections */}
        <div className="space-y-4">
          {SECTIONS.map((section, si) => {
            const Icon = section.icon;
            return (
              <div key={si} className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900">{section.title}</h3>
                </div>

                {/* Items with sub-headings */}
                {section.items && (
                  <div className="space-y-4">
                    {section.items.map((item, ii) => (
                      <div key={ii}>
                        <p className="text-sm font-medium text-gray-800 mb-1">{item.title}</p>
                        <div className="ml-3 border-l-2 border-gray-100 pl-3">
                          {renderContent(item.content)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Direct content (no sub-items) */}
                {section.content && (
                  <div className="ml-3 border-l-2 border-gray-100 pl-3">
                    {renderContent(section.content)}
                  </div>
                )}

                {/* Tip */}
                {section.tip && (
                  <div className="mt-4 flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                    <span className="text-green-600 font-semibold text-xs mt-0.5">TIP</span>
                    <p className="text-sm text-green-800">{section.tip}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div
          className="mt-6 rounded-xl p-6 text-white text-center"
          style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' }}
        >
          <p className="font-semibold text-lg mb-1">Ready to create amazing visualizations?</p>
          <p className="text-sm opacity-90">
            Start by uploading your first dataset and let D.Fuse work its magic!
          </p>
        </div>

        {/* Support */}
        <p className="text-center text-gray-400 text-xs mt-6">
          Questions? Reach out at <strong className="text-gray-500">dubey.ujjjwal1994@gmail.com</strong>
        </p>
      </div>
    </div>
  );
}
