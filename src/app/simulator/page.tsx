"use client";

import React, { useState, useMemo } from "react";

export default function EchoSimulator() {
  const [walkingLikes, setWalkingLikes] = useState<number>(0);
  const [civicVotes, setCivicVotes] = useState<number>(0);
  const [debateHeat, setDebateHeat] = useState<number>(0);
  const [ripples, setRipples] = useState<number>(0);
  const [hoursPassed, setHoursPassed] = useState<number>(0);
  const [toxicityFlags, setToxicityFlags] = useState<number>(0);

  const metrics = useMemo(() => {
    const BASE_RADIUS = 300;
    const MAX_CITY_RADIUS = 8000; // ~5 miles (Wilmington city limits)
    
    const interactionScore = (walkingLikes * 100) + (civicVotes * 150) + (debateHeat * 20);
    const rippleBonus = 1 + (ripples * 0.1);
    const multipliedScore = interactionScore * rippleBonus;

    const toxicityMultiplier = 1 + (toxicityFlags * 0.5);
    const totalDecay = hoursPassed * 50 * toxicityMultiplier;

    let finalRadius = BASE_RADIUS + multipliedScore - totalDecay;
    let shadowbanned = false;
    let hitCityWall = false;

    if (toxicityFlags >= 10) {
      finalRadius = 0;
      shadowbanned = true;
    } else {
      // 1. Enforce the Floor (Never drop below 300m)
      finalRadius = Math.max(BASE_RADIUS, finalRadius);
      
      // 2. Enforce the Ceiling (The City Wall)
      if (finalRadius >= MAX_CITY_RADIUS) {
        finalRadius = MAX_CITY_RADIUS;
        hitCityWall = true;
      }
    }

    return {
      radiusMeters: Math.round(finalRadius),
      radiusMiles: (finalRadius * 0.000621371).toFixed(2),
      shadowbanned,
      hitCityWall,
      rippleBonus: rippleBonus.toFixed(1),
      toxicityMultiplier: toxicityMultiplier.toFixed(1),
    };
  }, [walkingLikes, civicVotes, debateHeat, ripples, hoursPassed, toxicityFlags]);

  // Visual scaling (Max scale locked to the city radius)
  const visualScale = metrics.shadowbanned ? 0 : Math.max(0.1, metrics.radiusMeters / 4000);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 font-sans selection:bg-cyan-500/30">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">Echo Algorithm Simulator</h1>
          <p className="text-slate-400 max-w-2xl">
            Test the physical reach of a local post. Posts are strictly walled off at the city limits (~5 miles) to prevent inter-city bleeding.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Controls Column */}
          <div className="lg:col-span-5 space-y-6 bg-slate-900/50 p-6 rounded-2xl border border-slate-800 shadow-xl">
            {/* 1. Validation */}
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">1. Local Validation</h3>
            <div className="space-y-3">
              <div className="flex justify-between"><label className="text-sm font-medium text-emerald-400">Walking Likes</label><span className="text-sm font-mono text-emerald-400/80">{walkingLikes}</span></div>
              <input type="range" min="0" max="100" value={walkingLikes} onChange={(e) => setWalkingLikes(Number(e.target.value))} className="w-full accent-emerald-500" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between"><label className="text-sm font-medium text-blue-400">Civic Votes</label><span className="text-sm font-mono text-blue-400/80">{civicVotes}</span></div>
              <input type="range" min="0" max="100" value={civicVotes} onChange={(e) => setCivicVotes(Number(e.target.value))} className="w-full accent-blue-500" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between"><label className="text-sm font-medium text-amber-400">Debate Heat</label><span className="text-sm font-mono text-amber-400/80">{debateHeat}</span></div>
              <input type="range" min="0" max="100" value={debateHeat} onChange={(e) => setDebateHeat(Number(e.target.value))} className="w-full accent-amber-500" />
            </div>

            {/* 2. Velocity */}
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2 mt-8">2. External Velocity</h3>
            <div className="space-y-3">
              <div className="flex justify-between"><label className="text-sm font-medium text-purple-400">Ripples</label><span className="text-sm font-mono text-purple-400/80">{ripples}</span></div>
              <input type="range" min="0" max="50" value={ripples} onChange={(e) => setRipples(Number(e.target.value))} className="w-full accent-purple-500" />
            </div>

            {/* 3. Decay */}
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2 mt-8">3. Time & Harm Decay</h3>
            <div className="space-y-3">
              <div className="flex justify-between"><label className="text-sm font-medium text-slate-300">Hours Elapsed</label><span className="text-sm font-mono text-slate-400">{hoursPassed} hrs</span></div>
              <input type="range" min="0" max="72" value={hoursPassed} onChange={(e) => setHoursPassed(Number(e.target.value))} className="w-full accent-slate-500" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between"><label className="text-sm font-medium text-rose-500">Toxicity Flags</label><span className="text-sm font-mono text-rose-500/80">{toxicityFlags}</span></div>
              <input type="range" min="0" max="20" value={toxicityFlags} onChange={(e) => setToxicityFlags(Number(e.target.value))} className="w-full accent-rose-500" />
            </div>
          </div>

          {/* Visualizer Column */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center min-h-[600px] bg-slate-900/30 rounded-2xl border border-slate-800 relative overflow-hidden p-8 shadow-inner">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

            <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
              <div 
                className={`rounded-full transition-all duration-700 ease-out border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.5)] ${metrics.shadowbanned ? 'bg-rose-600' : metrics.hitCityWall ? 'bg-gradient-to-tr from-amber-500 to-orange-500 blur-md' : 'bg-gradient-to-tr from-cyan-600 to-emerald-500 blur-md'}`}
                style={{ width: '200px', height: '200px', transform: `scale(${visualScale})` }}
              />
              <div className="absolute w-2 h-2 bg-white rounded-full shadow-[0_0_10px_white]"></div>
            </div>

            <div className="relative z-10 text-center space-y-6 w-full max-w-md">
              {metrics.shadowbanned ? (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-500 px-8 py-6 rounded-2xl backdrop-blur-md shadow-2xl">
                  <h2 className="text-3xl font-black uppercase tracking-widest">Quarantined</h2>
                  <p className="text-sm mt-2 text-rose-400 font-medium">Toxicity threshold reached. Post hidden from map.</p>
                </div>
              ) : (
                <div className="space-y-2 bg-slate-950/80 p-8 rounded-3xl border border-slate-700/50 backdrop-blur-md shadow-2xl">
                  
                  {metrics.hitCityWall && (
                     <div className="inline-block bg-amber-500/20 border border-amber-500/50 text-amber-400 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4">
                       City Limit Reached
                     </div>
                  )}
                  
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Echo Radius</h3>
                  <div className={`text-6xl md:text-7xl font-black text-transparent bg-clip-text tabular-nums tracking-tighter py-2 ${metrics.hitCityWall ? 'bg-gradient-to-r from-amber-400 to-orange-400' : 'bg-gradient-to-r from-cyan-400 to-emerald-400'}`}>
                    {metrics.radiusMeters.toLocaleString()}<span className={`text-3xl ml-1 ${metrics.hitCityWall ? 'text-amber-600' : 'text-cyan-600'}`}>m</span>
                  </div>
                  <div className="flex items-center justify-center gap-4 text-slate-400 font-mono text-lg">
                    <span>{metrics.radiusMiles} mi</span>
                    <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                    <span>{metrics.rippleBonus}x Vel.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
