import React, { useState, useMemo, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  ReferenceLine
} from 'recharts';
import { 
  TrendingUp, 
  ShieldCheck, 
  Activity, 
  Info, 
  RefreshCw, 
  ArrowRightLeft,
  AlertCircle,
  Zap
} from 'lucide-react';
import { calculateOption } from './utils/blackScholes';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface SimulationState {
  stockPrice: number;
  strikePrice: number;
  volatility: number;
  timeToExpiry: number;
  riskFreeRate: number;
  optionType: 'call' | 'put';
  quantity: number; // Market maker is SHORT this quantity (selling to client)
  cumulativeProfit: number;
  tradesExecuted: number;
}

// --- Components ---

const StatCard = ({ label, value, subValue, icon: Icon, colorClass = "text-white" }: any) => (
  <div className="bg-[#151619] border border-[#2A2D32] p-4 rounded-lg shadow-lg">
    <div className="flex justify-between items-start mb-2">
      <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">{label}</span>
      <Icon size={14} className="text-gray-500" />
    </div>
    <div className={`text-2xl font-mono ${colorClass}`}>{value}</div>
    {subValue && <div className="text-[10px] font-mono text-gray-400 mt-1">{subValue}</div>}
  </div>
);

export default function App() {
  const [sim, setSim] = useState<SimulationState>({
    stockPrice: 100,
    strikePrice: 100,
    volatility: 0.25,
    timeToExpiry: 0.5,
    riskFreeRate: 0.05,
    optionType: 'call',
    quantity: 100, // 1 contract = 100 shares
    cumulativeProfit: 0,
    tradesExecuted: 0,
  });

  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [profitHistory, setProfitHistory] = useState<{ time: number; profit: number }[]>([]);

  // Calculate current state
  const currentOption = useMemo(() => {
    return calculateOption(
      sim.stockPrice,
      sim.strikePrice,
      sim.timeToExpiry,
      sim.riskFreeRate,
      sim.volatility,
      sim.optionType
    );
  }, [sim]);

  // Market Maker's Position: Short Option + Long Stock (Hedge)
  // Net Delta = (Short Option Delta * Quantity) + (Stock Delta * Stock Quantity)
  // For Net Delta = 0: Stock Quantity = - (Short Option Delta * Quantity)
  // Since Short Option Delta = - (Option Delta), Stock Quantity = Option Delta * Quantity
  const hedgeQuantity = useMemo(() => {
    return Math.round(currentOption.greeks.delta * sim.quantity);
  }, [currentOption.greeks.delta, sim.quantity]);

  // Generate data for the payoff chart
  const chartData = useMemo(() => {
    const data = [];
    const range = 40; // +/- 40% from strike
    const start = sim.strikePrice * (1 - range / 100);
    const end = sim.strikePrice * (1 + range / 100);
    const step = (end - start) / 50;

    for (let s = start; s <= end; s += step) {
      const opt = calculateOption(s, sim.strikePrice, sim.timeToExpiry, sim.riskFreeRate, sim.volatility, sim.optionType);
      
      // Market Maker's PnL relative to current price
      // PnL = -(OptionPrice_at_S - OptionPrice_at_Current) + (S - Current) * HedgeQuantity
      const optionPnL = -(opt.price - currentOption.price) * sim.quantity;
      const stockPnL = (s - sim.stockPrice) * hedgeQuantity;
      const totalPnL = optionPnL + stockPnL;

      data.push({
        price: parseFloat(s.toFixed(2)),
        optionPnL: parseFloat(optionPnL.toFixed(2)),
        stockPnL: parseFloat(stockPnL.toFixed(2)),
        totalPnL: parseFloat(totalPnL.toFixed(2)),
        delta: parseFloat(opt.greeks.delta.toFixed(3)),
      });
    }
    return data;
  }, [sim, currentOption, hedgeQuantity]);

  // Handle price changes
  const updatePrice = (newPrice: number) => {
    setSim(prev => ({ ...prev, stockPrice: newPrice }));
  };

  // Simulation loop
  useEffect(() => {
    let interval: any;
    if (isAutoPlaying) {
      interval = setInterval(() => {
        const volatility = sim.volatility / Math.sqrt(252 * 6.5 * 60); // Minutely vol
        const drift = (sim.riskFreeRate - 0.5 * sim.volatility ** 2) / (252 * 6.5 * 60);
        const change = Math.exp(drift + sim.volatility * (Math.random() - 0.5) * 0.1);
        
        setSim(prev => {
          const newPrice = prev.stockPrice * change;
          
          // 1. Theta Harvest (Time decay profit)
          // Theta is negative for long options, positive for short (MM is short)
          // currentOption.greeks.theta is usually negative for a call
          // MM is short, so they collect -theta
          const thetaPerTick = (-currentOption.greeks.theta / (252 * 6.5 * 60 * 10)) * prev.quantity;
          
          // 2. Spread Capture (Random trades)
          let spreadProfit = 0;
          let tradeAdded = 0;
          if (Math.random() > 0.9) { // 10% chance per tick to capture a trade
            spreadProfit = 0.02 * prev.quantity; // $0.02 spread per share
            tradeAdded = 1;
          }

          const newProfit = prev.cumulativeProfit + thetaPerTick + spreadProfit;

          return { 
            ...prev, 
            stockPrice: newPrice,
            cumulativeProfit: newProfit,
            tradesExecuted: prev.tradesExecuted + tradeAdded
          };
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isAutoPlaying, sim.volatility, sim.riskFreeRate, currentOption.greeks.theta]);

  // Update profit history
  useEffect(() => {
    if (isAutoPlaying) {
      const timer = setInterval(() => {
        setProfitHistory(prev => {
          const next = [...prev, { time: Date.now(), profit: sim.cumulativeProfit }];
          return next.slice(-50); // Keep last 50 points
        });
      }, 500);
      return () => clearInterval(timer);
    }
  }, [isAutoPlaying, sim.cumulativeProfit]);

  return (
    <div className="min-h-screen bg-[#0A0B0D] text-gray-300 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-[#1E2024] bg-[#0F1114] px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center text-black">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Delta Neutral Simulator</h1>
            <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Market Maker Risk Engine v1.0</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              isAutoPlaying 
                ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
            }`}
          >
            {isAutoPlaying ? <Activity size={14} className="animate-pulse" /> : <Zap size={14} />}
            {isAutoPlaying ? 'STOP SIMULATION' : 'START LIVE FEED'}
          </button>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Panel: Controls */}
        <div className="lg:col-span-3 space-y-6">
          <section className="bg-[#151619] border border-[#2A2D32] rounded-xl p-5 space-y-6">
            <div className="flex items-center gap-2 text-white border-b border-[#2A2D32] pb-3 mb-4">
              <TrendingUp size={16} className="text-emerald-500" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Market Parameters</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-mono uppercase text-gray-500">
                  <span>Underlying Price</span>
                  <span className="text-white">${sim.stockPrice.toFixed(2)}</span>
                </div>
                <input 
                  type="range" min="50" max="150" step="0.1"
                  value={sim.stockPrice}
                  onChange={(e) => updatePrice(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1 bg-[#2A2D32] rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-mono uppercase text-gray-500">
                  <span>Implied Volatility</span>
                  <span className="text-white">{(sim.volatility * 100).toFixed(1)}%</span>
                </div>
                <input 
                  type="range" min="0.05" max="1" step="0.01"
                  value={sim.volatility}
                  onChange={(e) => setSim(prev => ({ ...prev, volatility: parseFloat(e.target.value) }))}
                  className="w-full accent-emerald-500 h-1 bg-[#2A2D32] rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-mono uppercase text-gray-500">
                  <span>Time to Expiry</span>
                  <span className="text-white">{(sim.timeToExpiry * 365).toFixed(0)} Days</span>
                </div>
                <input 
                  type="range" min="0.01" max="2" step="0.01"
                  value={sim.timeToExpiry}
                  onChange={(e) => setSim(prev => ({ ...prev, timeToExpiry: parseFloat(e.target.value) }))}
                  className="w-full accent-emerald-500 h-1 bg-[#2A2D32] rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[#2A2D32]">
              <div className="flex gap-2">
                <button 
                  onClick={() => setSim(prev => ({ ...prev, optionType: 'call' }))}
                  className={`flex-1 py-2 rounded text-[10px] font-bold uppercase tracking-widest transition-all ${
                    sim.optionType === 'call' ? 'bg-emerald-500 text-black' : 'bg-[#1E2024] text-gray-500 hover:text-white'
                  }`}
                >
                  Call Option
                </button>
                <button 
                  onClick={() => setSim(prev => ({ ...prev, optionType: 'put' }))}
                  className={`flex-1 py-2 rounded text-[10px] font-bold uppercase tracking-widest transition-all ${
                    sim.optionType === 'put' ? 'bg-emerald-500 text-black' : 'bg-[#1E2024] text-gray-500 hover:text-white'
                  }`}
                >
                  Put Option
                </button>
              </div>
            </div>
          </section>

          <section className="bg-[#151619] border border-[#2A2D32] rounded-xl p-5">
            <div className="flex items-center gap-2 text-white border-b border-[#2A2D32] pb-3 mb-4">
              <Zap size={16} className="text-yellow-500" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Profit Engine</h2>
            </div>
            <div className="space-y-4">
              <div className="p-3 bg-black/40 rounded border border-white/5">
                <div className="text-[10px] font-mono text-gray-500 uppercase mb-1">Cumulative Edge</div>
                <div className="text-xl font-mono text-emerald-400">${sim.cumulativeProfit.toFixed(2)}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-black/20 rounded border border-white/5 text-center">
                  <div className="text-[9px] font-mono text-gray-500 uppercase">Trades</div>
                  <div className="text-sm font-mono text-white">{sim.tradesExecuted}</div>
                </div>
                <div className="p-2 bg-black/20 rounded border border-white/5 text-center">
                  <div className="text-[9px] font-mono text-gray-500 uppercase">Spread/Trade</div>
                  <div className="text-sm font-mono text-white">$2.00</div>
                </div>
              </div>
              <div className="h-24 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={profitHistory}>
                    <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5">
            <div className="flex items-center gap-2 text-emerald-500 mb-3">
              <Info size={16} />
              <h3 className="text-xs font-bold uppercase tracking-wider">The Mechanism</h3>
            </div>
            <p className="text-xs leading-relaxed text-gray-400">
              As a market maker, you sold <span className="text-white">1 contract</span> ({sim.quantity} shares). 
              To remain <span className="text-emerald-400">risk neutral</span>, you must hold <span className="text-white">{hedgeQuantity} shares</span> of the underlying stock.
            </p>
            <div className="mt-4 p-3 bg-black/40 rounded border border-white/5 font-mono text-[10px] text-gray-500">
              Net Delta = (Option Δ × -100) + (Stock Δ × Hedge Qty)
              <br />
              <span className="text-emerald-500">
                ≈ ({(currentOption.greeks.delta).toFixed(3)} × -100) + (1.000 × {hedgeQuantity}) = {((currentOption.greeks.delta * -100) + hedgeQuantity).toFixed(2)}
              </span>
            </div>
          </section>
        </div>

        {/* Center Panel: Visualization */}
        <div className="lg:col-span-9 space-y-6">
          
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard 
              label="Option Price" 
              value={`$${currentOption.price.toFixed(2)}`} 
              subValue={`Total Value: $${(currentOption.price * sim.quantity).toFixed(2)}`}
              icon={TrendingUp}
            />
            <StatCard 
              label="Option Delta" 
              value={currentOption.greeks.delta.toFixed(3)} 
              subValue="Sensitivity to Price"
              icon={Activity}
              colorClass="text-emerald-400"
            />
            <StatCard 
              label="Hedge Required" 
              value={`${hedgeQuantity} Shares`} 
              subValue="Dynamic Adjustment"
              icon={ArrowRightLeft}
              colorClass="text-blue-400"
            />
            <StatCard 
              label="Gamma Risk" 
              value={currentOption.greeks.gamma.toFixed(4)} 
              subValue="Delta Sensitivity"
              icon={AlertCircle}
              colorClass="text-orange-400"
            />
          </div>

          {/* Main Chart */}
          <div className="bg-[#151619] border border-[#2A2D32] rounded-xl p-6 h-[500px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Risk Neutrality Visualization</h3>
                <p className="text-[10px] text-gray-500 font-mono">PNL Profile: Option vs. Stock Hedge</p>
              </div>
              <div className="flex gap-4 text-[10px] font-mono uppercase">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500/50" />
                  <span>Option PnL</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-500/50" />
                  <span>Stock PnL</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-emerald-500 font-bold">Total Net PnL</span>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2024" vertical={false} />
                  <XAxis 
                    dataKey="price" 
                    stroke="#4B5563" 
                    fontSize={10} 
                    tickFormatter={(val) => `$${val}`}
                    domain={['dataMin', 'dataMax']}
                  />
                  <YAxis 
                    stroke="#4B5563" 
                    fontSize={10} 
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0F1114', border: '1px solid #2A2D32', borderRadius: '8px', fontSize: '10px' }}
                    itemStyle={{ padding: '2px 0' }}
                  />
                  <ReferenceLine x={sim.stockPrice} stroke="#6B7280" strokeDasharray="3 3" label={{ position: 'top', value: 'Current Price', fill: '#9CA3AF', fontSize: 10 }} />
                  <Area type="monotone" dataKey="totalPnL" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" name="Net PnL" />
                  <Line type="monotone" dataKey="optionPnL" stroke="#ef4444" strokeWidth={1} strokeDasharray="5 5" dot={false} name="Option PnL" />
                  <Line type="monotone" dataKey="stockPnL" stroke="#3b82f6" strokeWidth={1} strokeDasharray="5 5" dot={false} name="Stock PnL" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="mt-4 pt-4 border-t border-[#2A2D32] flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] text-gray-500 italic">
                <RefreshCw size={12} className={isAutoPlaying ? "animate-spin" : ""} />
                Notice how the Net PnL is flat (near zero) around the current price. This is the "Risk Neutral" zone.
              </div>
              <div className="text-[10px] font-mono text-gray-400">
                Strike: ${sim.strikePrice} | IV: {(sim.volatility * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Explanation Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#151619] border border-[#2A2D32] rounded-xl p-5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                The Delta Hedge
              </h4>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                When a market maker sells an option, they take on price risk. If the stock moves up, a call option they sold becomes more expensive. To offset this, they buy the stock. The amount they buy is determined by the <strong>Delta</strong>.
              </p>
            </div>
            <div className="bg-[#151619] border border-[#2A2D32] rounded-xl p-5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                Gamma: The Enemy
              </h4>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Delta isn't constant. As the stock price moves, the option's Delta changes. This is <strong>Gamma</strong>. This means the market maker must constantly buy or sell more stock to stay neutral, which is called <strong>Dynamic Rebalancing</strong>.
              </p>
            </div>
            <div className="bg-[#151619] border border-[#2A2D32] rounded-xl p-5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                The Edge: Why MMs Win
              </h4>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Market makers don't gamble on direction. They profit from the <strong>Bid-Ask Spread</strong> (the fee for providing liquidity) and <strong>Theta</strong> (collecting time decay while hedged). By staying delta-neutral, they turn trading into a high-frequency statistical game where the "house" always has a slight edge.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer / Status Bar */}
      <footer className="border-t border-[#1E2024] bg-[#0F1114] px-6 py-2 flex justify-between items-center fixed bottom-0 w-full z-50">
        <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            SYSTEM OPERATIONAL
          </div>
          <div className="flex items-center gap-1.5">
            LATENCY: 12ms
          </div>
        </div>
        <div className="text-[10px] font-mono text-gray-500">
          © 2026 MM RISK ENGINE • PROPRIETARY TRADING INTERFACE
        </div>
      </footer>
    </div>
  );
}
