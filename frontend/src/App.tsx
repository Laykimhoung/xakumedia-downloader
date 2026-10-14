import React from "react";

export const App: React.FC = () => {
  return (
    <div className="flex h-screen w-screen bg-brand-black text-brand-white select-none">
      <aside className="w-64 border-r border-brand-dark bg-brand-black/50 p-4">
        <div className="flex items-center space-x-2 pb-6">
          <div className="h-4 w-4 rounded-full bg-brand-red" />
          <span className="font-bold tracking-wider text-sm uppercase">XakuMedia</span>
        </div>
        <nav className="space-y-1 text-sm text-neutral-400">
          <div className="rounded px-3 py-2 text-brand-white bg-brand-dark/50 font-medium">Scan Media</div>
          <div className="rounded px-3 py-2 hover:bg-brand-dark/30 hover:text-brand-white cursor-pointer transition-colors">Media Library</div>
          <div className="rounded px-3 py-2 hover:bg-brand-dark/30 hover:text-brand-white cursor-pointer transition-colors">Downloads</div>
          <div className="rounded px-3 py-2 hover:bg-brand-dark/30 hover:text-brand-white cursor-pointer transition-colors">Settings</div>
        </nav>
      </aside>
      <main className="flex-1 flex flex-col p-8 overflow-auto">
        <h1 className="text-2xl font-bold tracking-tight">Scan Media</h1>
        <p className="text-sm text-neutral-400 mt-1">Paste a media, post, or gallery URL to discover items.</p>
      </main>
    </div>
  );
};

export default App;
