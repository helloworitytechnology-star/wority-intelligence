"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  LayoutDashboard, 
  PlusSquare, 
  Building2, 
  Users, 
  Mail, 
  FileText, 
  History, 
  Settings, 
  Search, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Copy, 
  Check,
  Download,
  TrendingUp,
  DollarSign,
  UserCheck,
  BarChart3,
  ExternalLink,
  ChevronRight,
  Send,
  Loader2,
  RefreshCw,
  Sliders,
  Filter,
  Briefcase,
  Database
} from "lucide-react";

export default function Home() {
  // Navigation & UI state
  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [rankFilter, setRankFilter] = useState("All");

  // API Data states
  const [kpis, setKpis] = useState<any>({
    total_opportunities: 0,
    new_today: 0,
    duplicates_removed: 0,
    research_completed: 0,
    emails_generated: 0,
    high_priority: 0,
    meetings_booked: 0,
    proposal_sent: 0,
    pipeline_value: 0,
    estimated_revenue: 0,
    classifications_breakdown: {}
  });

  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedOppId, setSelectedOppId] = useState<number | null>(null);
  const [selectedOppDetail, setSelectedOppDetail] = useState<any>(null);
  const [inputText, setInputText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [apiConnected, setApiConnected] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // RAG Knowledge Base States
  const [documents, setDocuments] = useState<any[]>([]);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocContent, setNewDocContent] = useState("");
  const [isAddingDoc, setIsAddingDoc] = useState(false);

  // Operation States
  const [isSyncingCRM, setIsSyncingCRM] = useState<number | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState<number | null>(null);

  // Bid Compliance & DSR States
  const [bidCompliance, setBidCompliance] = useState<any>(null);
  const [isCrawlingTenders, setIsCrawlingTenders] = useState(false);
  const [isDsrOpen, setIsDsrOpen] = useState(false);

  // Settings state
  const [settings, setSettings] = useState({
    confidence_threshold: 70,
    active_enrichment_providers: ["Apollo", "Hunter", "LinkedIn"],
    crm_sync_enabled: true,
    target_crm: "HubSpot",
    notification_slack_url: "",
    default_email_tone: "Consultative",
    auto_pilot_enabled: true
  });

  const [simReplyText, setSimReplyText] = useState("");
  const [isSimulatingReply, setIsSimulatingReply] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";

  const loadKnowledgeDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error("Failed to load documents:", err);
    }
  };

  // Fetch all dashboard data
  const loadDashboardData = async () => {
    try {
      const resKpi = await fetch(`${API_BASE}/kpis`);
      if (resKpi.ok) {
        const kpiData = await resKpi.json();
        setKpis(kpiData);
      }
      
      const resOpp = await fetch(`${API_BASE}/opportunities`);
      if (resOpp.ok) {
        const oppData = await resOpp.json();
        setOpportunities(oppData);
      }
      
      const resComp = await fetch(`${API_BASE}/companies`);
      if (resComp.ok) {
        const compData = await resComp.json();
        setCompanies(compData);
      }
      
      const resCont = await fetch(`${API_BASE}/contacts`);
      if (resCont.ok) {
        const contData = await resCont.json();
        setContacts(contData);
      }
      
      const resLogs = await fetch(`${API_BASE}/logs`);
      if (resLogs.ok) {
        const logData = await resLogs.json();
        setLogs(logData);
      }

      await loadKnowledgeDocuments();

      const resSettings = await fetch(`${API_BASE}/settings`);
      if (resSettings.ok) {
        const settingsData = await resSettings.json();
        if (settingsData.auto_pilot !== undefined) {
          setSettings(prev => ({ 
            ...prev, 
            auto_pilot_enabled: typeof settingsData.auto_pilot === 'object' ? !!settingsData.auto_pilot.enabled : !!settingsData.auto_pilot 
          }));
        }
      }

      setApiConnected(true);
    } catch (err) {
      console.error("API connection failed:", err);
      setApiConnected(false);
    }
  };

  // RAG Document Handlers
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim() || !newDocContent.trim()) return;
    setIsAddingDoc(true);
    try {
      const res = await fetch(`${API_BASE}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: newDocTitle, content: newDocContent })
      });
      if (res.ok) {
        setNewDocTitle("");
        setNewDocContent("");
        await loadKnowledgeDocuments();
        alert("Document vectorized and added to pgvector knowledge base!");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAddingDoc(false);
    }
  };

  const handleDeleteDocument = async (id: number) => {
    if (!confirm("Remove this document from pgvector knowledge store?")) return;
    try {
      const res = await fetch(`${API_BASE}/documents/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await loadKnowledgeDocuments();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // CRM Sync Handlers
  const handleSyncCRM = async (oppId: number) => {
    setIsSyncingCRM(oppId);
    try {
      const res = await fetch(`${API_BASE}/opportunities/${oppId}/sync`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        await loadDashboardData();
        if (selectedOppId === oppId) {
          await loadOpportunityDetail(oppId);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncingCRM(null);
    }
  };

  // Email Send Handlers
  const handleSendEmail = async (emailId: number, oppId: number) => {
    setIsSendingEmail(emailId);
    try {
      const res = await fetch(`${API_BASE}/emails/${emailId}/send`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        await loadDashboardData();
        if (selectedOppId === oppId) {
          await loadOpportunityDetail(oppId);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSendingEmail(null);
    }
  };

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  // Fetch specific opportunity details
  const loadOpportunityDetail = async (id: number) => {
    setLoadingDetail(true);
    setBidCompliance(null);
    try {
      const res = await fetch(`${API_BASE}/opportunities/${id}`);
      if (res.ok) {
        const detail = await res.json();
        setSelectedOppDetail(detail);
      }

      const resComp = await fetch(`${API_BASE}/opportunities/${id}/bid-compliance`);
      if (resComp.ok) {
        const compData = await resComp.json();
        setBidCompliance(compData);
      }
    } catch (err) {
      console.error("Failed to load details:", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleTriggerTenderScraper = async () => {
    setIsCrawlingTenders(true);
    try {
      const res = await fetch(`${API_BASE}/scrape/tenders`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        await loadDashboardData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCrawlingTenders(false);
    }
  };

  const handleSignProposal = async (oppId: number) => {
    try {
      const res = await fetch(`${API_BASE}/opportunities/${oppId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Won" })
      });
      if (res.ok) {
        alert("Proposal signed and project marked as WON! Kickoff scheduled.");
        setIsDsrOpen(false);
        await loadDashboardData();
        if (selectedOppId === oppId) {
          await loadOpportunityDetail(oppId);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedOppId !== null) {
      loadOpportunityDetail(selectedOppId);
    }
  }, [selectedOppId]);

  // Copy text utility
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Submit bulk requirements
  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setIsUploading(true);
    setUploadSuccess(false);
    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText })
      });
      if (res.ok) {
        setInputText("");
        setUploadSuccess(true);
        loadDashboardData();
        setTimeout(() => {
          setUploadSuccess(false);
          setActiveMenu("queue");
        }, 2000);
      } else {
        alert("Upload failed. Ensure backend service is running.");
      }
    } catch (err) {
      console.error(err);
      alert("Error sending request to backend.");
    } finally {
      setIsUploading(false);
    }
  };

  const updateOppStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`${API_BASE}/opportunities/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        loadDashboardData();
        if (selectedOppId === id) {
          loadOpportunityDetail(id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Quick stats computed
  const filteredOpps = opportunities.filter(opp => {
    const matchesSearch = opp.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          opp.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          opp.classification.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" || opp.status === statusFilter;
    const matchesRank = rankFilter === "All" || opp.rank === rankFilter;
    return matchesSearch && matchesStatus && matchesRank;
  });

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 font-sans overflow-hidden">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#0c0c0e] border-r border-zinc-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Brand Header */}
          <div className="p-6 border-b border-zinc-800 flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-[#09090b] shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              W
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-wide text-zinc-100">Wority AI</h1>
              <p className="text-[10px] text-zinc-500 font-mono">Opportunity Agent</p>
            </div>
          </div>

          {/* Connection status */}
          <div className="px-6 py-2 border-b border-zinc-800/50 flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 font-mono">Backend Status:</span>
            <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${apiConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
              {apiConnected ? "Connected" : "Offline"}
            </span>
          </div>

          {/* Menus */}
          <nav className="p-4 space-y-1">
            {[
              { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
              { id: "new", label: "New Opportunity", icon: PlusSquare },
              { id: "queue", label: "Opportunity Queue", icon: Briefcase, badge: opportunities.filter(o => o.status === "New" || o.status === "Researching").length },
              { id: "companies", label: "Companies", icon: Building2 },
              { id: "contacts", label: "Contacts", icon: Users },
              { id: "campaigns", label: "Email Campaigns", icon: Mail },
              { id: "knowledge", label: "Knowledge Base (RAG)", icon: Database },
              { id: "logs", label: "Audit & Skip Logs", icon: History },
              { id: "settings", label: "Settings", icon: Settings },
            ].map(menu => {
              const Icon = menu.icon;
              const isActive = activeMenu === menu.id;
              return (
                <button
                  key={menu.id}
                  onClick={() => setActiveMenu(menu.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    isActive 
                      ? "bg-zinc-800/80 text-zinc-100 border border-zinc-700/50 shadow-sm" 
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-zinc-500'}`} />
                    <span>{menu.label}</span>
                  </div>
                  {menu.badge ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-semibold">
                      {menu.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-[#0c0c0e]/80">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-emerald-400 border border-zinc-700">
              WT
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-zinc-300 truncate">Wority Technology</p>
              <a href="https://woritytechnology.com/" target="_blank" rel="noreferrer" className="text-[10px] text-emerald-500 hover:underline flex items-center space-x-1">
                <span>woritytechnology.com</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Workspace Panel */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#09090b]">
        {/* Header Search / Quick controls */}
        <header className="h-16 border-b border-zinc-800 px-8 flex items-center justify-between bg-[#0c0c0e]/40 backdrop-blur-md shrink-0">
          <div className="flex items-center space-x-4">
            <h2 className="text-sm font-semibold capitalize tracking-wide text-zinc-200 font-mono">
              {activeMenu.replace("-", " ")} Workspace
            </h2>
          </div>
          
          <div className="flex items-center space-x-4">
            <button 
              onClick={loadDashboardData}
              className="p-2 rounded-lg border border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search everything..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 w-64 bg-zinc-900/50 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:border-zinc-700 transition-colors text-zinc-200 placeholder-zinc-500"
              />
            </div>
          </div>
        </header>

        {/* Dynamic Panels */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          
          {/* 1. DASHBOARD VIEW */}
          {activeMenu === "dashboard" && (
            <div className="space-y-8">
              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { title: "Total Opportunities", value: kpis.total_opportunities, sub: `${kpis.new_today} added today`, icon: Briefcase, color: "text-emerald-400" },
                  { title: "Pipeline Value", value: `$${(kpis.pipeline_value / 1000).toFixed(0)}k`, sub: `Est: $${(kpis.estimated_revenue / 1000).toFixed(0)}k`, icon: DollarSign, color: "text-blue-400" },
                  { title: "Emails Dispatched", value: kpis.emails_sent, sub: `${kpis.emails_sent_today} / 25 sent today`, icon: Send, color: "text-amber-400" },
                  { title: "LinkedIn Invites", value: kpis.linkedin_sent, sub: `${kpis.linkedin_sent_today} / 10 sent today`, icon: UserCheck, color: "text-teal-400" },
                  { title: "Duplicates Skipped", value: kpis.duplicates_removed, sub: "Auto-filtered records", icon: XCircle, color: "text-rose-400" },
                ].map((kpi, idx) => {
                  const Icon = kpi.icon;
                  return (
                    <div key={idx} className="bg-gradient-to-b from-zinc-900/40 to-zinc-950/70 border border-zinc-850 p-5 rounded-2xl flex flex-col justify-between hover:border-emerald-500/20 hover:shadow-[0_0_15px_rgba(16,185,129,0.02)] transition-all duration-300 relative group overflow-hidden">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-emerald-500/5 to-transparent rounded-bl-full group-hover:from-emerald-500/10 transition-all duration-300"></div>
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest font-mono">{kpi.title}</span>
                        <div className={`p-1.5 bg-zinc-900 rounded-lg border border-zinc-800 ${kpi.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold font-mono tracking-tight text-zinc-100 bg-gradient-to-r from-zinc-100 to-zinc-350 bg-clip-text text-transparent">{kpi.value}</h3>
                        <p className="text-[9px] text-zinc-550 mt-1 font-mono">{kpi.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Requirement Type Classification Breakdown List */}
              <div className="bg-zinc-950 border border-zinc-800/80 p-6 rounded-xl space-y-4">
                <div>
                  <h3 className="text-sm font-semibold tracking-wide text-zinc-200">Opportunity Classifications</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">Volume breakdown of processed requirement categories</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {Object.entries(kpis.classifications_breakdown || {}).map(([category, count]: [string, any]) => (
                    <div key={category} className="p-3 bg-zinc-900/20 border border-zinc-900 hover:border-zinc-800 rounded-xl flex items-center justify-between hover:bg-zinc-900/40 transition-all duration-200">
                      <span className="text-[10px] font-mono text-zinc-400 truncate" title={category}>{category}</span>
                      <span className="text-xs font-bold text-emerald-400 font-mono bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 ml-2">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chart Visualizations & Lists */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Sales pipeline chart mockup */}
                <div className="lg:col-span-2 bg-zinc-950 border border-zinc-800/80 p-6 rounded-xl space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-sm font-semibold tracking-wide text-zinc-200">Pipeline Funnel Distribution</h3>
                      <p className="text-[10px] text-zinc-500 font-mono">Opportunity ranks and scores</p>
                    </div>
                    <BarChart3 className="w-5 h-5 text-emerald-400" />
                  </div>
                  
                  {/* SVG Chart */}
                  <div className="h-60 flex items-end space-x-6 pt-4 border-b border-zinc-800 pb-2">
                    {[
                      { label: "RFP (A+)", val: 85, color: "from-emerald-500 to-teal-400" },
                      { label: "Hiring (A)", val: 72, color: "from-emerald-400 to-teal-500" },
                      { label: "AI Auto (A+)", val: 94, color: "from-emerald-600 to-emerald-400" },
                      { label: "Custom Dev (B)", val: 58, color: "from-zinc-500 to-zinc-400" },
                      { label: "Cybersecurity (C)", val: 40, color: "from-zinc-600 to-zinc-500" },
                      { label: "Tenders (B)", val: 65, color: "from-blue-500 to-teal-400" }
                    ].map((item, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group">
                        <div className="text-[10px] font-mono font-bold text-zinc-400 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.val}%
                        </div>
                        <div 
                          style={{ height: `${item.val}%` }} 
                          className={`w-full rounded-t-md bg-gradient-to-t ${item.color} opacity-80 group-hover:opacity-100 transition-opacity shadow-[0_0_10px_rgba(16,185,129,0.15)]`}
                        ></div>
                        <span className="text-[9px] text-zinc-500 mt-2 font-mono truncate w-full text-center">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Priority Opportunities List */}
                <div className="bg-zinc-950 border border-zinc-800/80 p-6 rounded-xl space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-sm font-semibold tracking-wide text-zinc-200">High Fit Opportunities</h3>
                      <p className="text-[10px] text-zinc-500 font-mono">Ranks A+ and A</p>
                    </div>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                      {opportunities.filter(o => o.rank === "A+" || o.rank === "A").length} Leads
                    </span>
                  </div>

                  <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
                    {opportunities
                      .filter(o => o.rank === "A+" || o.rank === "A")
                      .slice(0, 5)
                      .map((opp) => (
                        <div 
                          key={opp.id} 
                          onClick={() => { setSelectedOppId(opp.id); setActiveMenu("queue"); }}
                          className="p-3 bg-zinc-900/60 border border-zinc-800/50 rounded-lg flex items-center justify-between hover:border-zinc-700 cursor-pointer transition-all duration-200"
                        >
                          <div className="overflow-hidden pr-2">
                            <h4 className="text-xs font-semibold text-zinc-200 truncate">{opp.title}</h4>
                            <p className="text-[10px] text-zinc-500 truncate mt-0.5">{opp.company_name}</p>
                          </div>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                            opp.rank === 'A+' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                          }`}>
                            {opp.rank}
                          </span>
                        </div>
                    ))}
                    {opportunities.filter(o => o.rank === "A+" || o.rank === "A").length === 0 && (
                      <p className="text-xs text-zinc-500 text-center py-8">No A/A+ opportunities found. Upload some requirements to process them.</p>
                    )}
                  </div>
                </div>

              </div>

              {/* Recent Activity stream */}
              <div className="bg-zinc-950 border border-zinc-800/80 p-6 rounded-xl space-y-4">
                <h3 className="text-sm font-semibold tracking-wide text-zinc-200">Recent Workflow Logs</h3>
                <div className="space-y-3 max-h-[200px] overflow-y-auto">
                  {logs.slice(0, 5).map((log, i) => (
                    <div key={i} className="flex items-start space-x-3 text-xs border-b border-zinc-900 pb-2">
                      {log.type === 'duplicate' ? (
                        <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      ) : log.status === 'Success' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="font-medium text-zinc-300">{log.action} - <span className="text-[10px] text-zinc-500 font-mono">{log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}</span></p>
                        <p className="text-zinc-500 text-[10px] mt-0.5">{log.details}</p>
                      </div>
                    </div>
                  ))}
                  {logs.length === 0 && (
                    <p className="text-xs text-zinc-500 text-center py-4">No audit logs recorded yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. CHAT CONSOLE / NEW OPPORTUNITY */}
          {activeMenu === "new" && (
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-xl space-y-6">
                <div>
                  <h3 className="text-sm font-semibold tracking-wide text-zinc-200">AI SDR Pipeline Chat Console</h3>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1">
                    Paste a single RFP or bulk dump multiple hiring/software project requirements (up to 35 together).
                  </p>
                </div>

                <form onSubmit={handleBulkUpload} className="space-y-4">
                  <div className="relative">
                    <textarea
                      rows={14}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder={`Example:
---
RFP: AI Chatbot Implementation for Retail Inc.
Company: Retail Corp
Website: retailcorp.com
Email: procurement@retailcorp.com
Looking for an experienced agency to build an Agentic AI Voice agent for order support.

---
Job ID: NET-551
Company: HealthCare Solutions
We need a dedicated .NET Development Team for staff augmentation for 6 months. contact: lead.hiring@hcsolutions.org
`}
                      className="w-full p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs font-mono focus:outline-none focus:border-zinc-700 transition-colors text-zinc-300 leading-relaxed placeholder-zinc-600 resize-y"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Supported formats: Plain Text, Emails, Tender specs. The AI automatically splits, deduplicates, and enriches records.
                    </span>
                    <button
                      type="submit"
                      disabled={isUploading || !inputText.trim()}
                      className="inline-flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-[#09090b] font-bold rounded-lg text-xs transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Splitting & Enrolling...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Launch Sales Engine</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {uploadSuccess && (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg flex items-center space-x-3 text-xs animate-pulse">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Bulk requirements submitted! Pipeline initiated. Redirecting to queue...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. OPPORTUNITY QUEUE */}
          {activeMenu === "queue" && (
            <div className="space-y-6">
              
              {/* Filters */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950 p-4 border border-zinc-800/80 rounded-xl">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Filter className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Filters:</span>
                  </div>
                  
                  {/* Status filter */}
                  <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 text-[11px] rounded px-2.5 py-1 text-zinc-300 focus:outline-none focus:border-zinc-700"
                  >
                    <option value="All">All Statuses</option>
                    <option value="New">New</option>
                    <option value="Researching">Researching</option>
                    <option value="Completed">Completed</option>
                    <option value="Needs Review">Needs Review</option>
                    <option value="Proposal Sent">Proposal Sent</option>
                    <option value="Meeting Scheduled">Meeting Scheduled</option>
                  </select>

                  {/* Rank filter */}
                  <select 
                    value={rankFilter}
                    onChange={(e) => setRankFilter(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 text-[11px] rounded px-2.5 py-1 text-zinc-300 focus:outline-none focus:border-zinc-700"
                  >
                    <option value="All">All Ranks</option>
                    <option value="A+">Rank A+</option>
                    <option value="A">Rank A</option>
                    <option value="B">Rank B</option>
                    <option value="C">Rank C</option>
                    <option value="D">Rank D</option>
                  </select>
                </div>
                
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => window.open(`${API_BASE}/opportunities/export`, '_blank')}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-350 hover:text-zinc-200 font-bold rounded-lg text-[10px] transition-all"
                    title="Export all leads as CSV for Google Sheets"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Export CSV (Google Sheets)</span>
                  </button>

                  <button
                    onClick={handleTriggerTenderScraper}
                    disabled={isCrawlingTenders}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-[#09090b] font-bold rounded-lg text-[10px] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                  >
                    {isCrawlingTenders ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Crawling SAM.gov...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3 animate-pulse" />
                        <span>Crawl Tenders Feed</span>
                      </>
                    )}
                  </button>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Showing {filteredOpps.length} opportunities
                  </span>
                </div>
              </div>

              {/* Table / Queue Split */}
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-8 items-start">
                
                {/* Opportunities Table */}
                <div className="xl:col-span-3 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-500 font-mono text-[10px] uppercase tracking-wider">
                          <th className="p-4">Opportunity</th>
                          <th className="p-4">Client</th>
                          <th className="p-4">Classification</th>
                          <th className="p-4 text-center">Score / Fit</th>
                          <th className="p-4">Status</th>
                          <th className="p-4"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900">
                        {filteredOpps.map((opp) => (
                          <tr 
                            key={opp.id}
                            onClick={() => setSelectedOppId(opp.id)}
                            className={`hover:bg-zinc-900/40 cursor-pointer transition-colors ${
                              selectedOppId === opp.id ? 'bg-zinc-800/20' : ''
                            }`}
                          >
                            <td className="p-4">
                              <p className="font-semibold text-zinc-200">{opp.title}</p>
                              <span className="text-[10px] text-zinc-500 font-mono">ID: REQ-{opp.id}</span>
                            </td>
                            <td className="p-4 text-zinc-300">{opp.company_name}</td>
                            <td className="p-4">
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                                {opp.classification || "Pending"}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <div className="inline-flex flex-col items-center">
                                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                  opp.rank === 'A+' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                  opp.rank === 'A' ? 'bg-emerald-500/5 text-emerald-300 border border-emerald-500/10' :
                                  opp.rank === 'B' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                  'bg-zinc-500/10 text-zinc-400 border border-zinc-800'
                                }`}>
                                  {opp.rank || "N/A"}
                                </span>
                                <span className="text-[9px] text-zinc-500 font-mono mt-1">{opp.overall_score || 0}% Match</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                                opp.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                opp.status === 'Researching' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse' :
                                opp.status === 'Needs Review' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                opp.status === 'Proposal Sent' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                'bg-zinc-800 text-zinc-400'
                              }`}>
                                {opp.status}
                              </span>
                            </td>
                            <td className="p-4">
                              <ChevronRight className="w-4 h-4 text-zinc-600" />
                            </td>
                          </tr>
                        ))}
                        {filteredOpps.length === 0 && (
                          <tr>
                            <td colSpan={6} className="text-center p-8 text-zinc-500 font-mono">
                              No matching opportunities in the queue.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Selected Detail Panel */}
                <div className="xl:col-span-2 space-y-6">
                  {selectedOppId === null ? (
                    <div className="bg-zinc-950 border border-zinc-800 p-8 rounded-xl text-center text-zinc-500 flex flex-col items-center justify-center min-h-[300px]">
                      <Briefcase className="w-8 h-8 text-zinc-700 mb-3" />
                      <p className="text-xs font-mono">Select an opportunity from the queue to view full AI research, scores, email templates, and proposal drafts.</p>
                    </div>
                  ) : loadingDetail ? (
                    <div className="bg-zinc-950 border border-zinc-800 p-8 rounded-xl text-center text-zinc-400 flex flex-col items-center justify-center min-h-[300px]">
                      <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mb-3" />
                      <p className="text-xs font-mono">Invoking research agents...</p>
                    </div>
                  ) : selectedOppDetail ? (
                    <div className="space-y-6 bg-zinc-950 border border-zinc-850 p-6 rounded-xl shadow-lg border-zinc-800">
                      
                      {/* Title & Status */}
                      <div className="flex justify-between items-start border-b border-zinc-900 pb-4">
                        <div>
                          <h3 className="text-sm font-semibold text-zinc-100">{selectedOppDetail.opportunity.title}</h3>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            Client: <span className="text-emerald-500">{selectedOppDetail.company.name}</span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end space-y-2">
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                            selectedOppDetail.opportunity.rank === 'A+' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                          }`}>
                            Rank {selectedOppDetail.opportunity.rank}
                          </span>
                          <select 
                            value={selectedOppDetail.opportunity.status}
                            onChange={(e) => updateOppStatus(selectedOppDetail.opportunity.id, e.target.value)}
                            className="bg-zinc-900 border border-zinc-800 text-[10px] rounded px-2 py-1 text-zinc-300 focus:outline-none"
                          >
                            <option value="New">New</option>
                            <option value="Researching">Researching</option>
                            <option value="Completed">Completed</option>
                            <option value="Needs Review">Needs Review</option>
                            <option value="Proposal Sent">Proposal Sent</option>
                            <option value="Meeting Scheduled">Meeting Scheduled</option>
                            <option value="Lost">Lost</option>
                            <option value="Won">Won</option>
                          </select>
                        </div>
                      </div>

                      {/* Visual Pipeline Progression Map */}
                      <div className="bg-zinc-900/20 p-4 rounded-xl border border-zinc-900 space-y-3">
                        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block">Pipeline Progression Tracker</span>
                        <div className="flex items-center justify-between relative pt-2">
                          <div className="absolute top-[21px] left-3 right-3 h-[2px] bg-zinc-850 z-0"></div>
                          
                          {[
                            { step: "Discovered", active: true },
                            { step: "Enriched", active: selectedOppDetail.contacts && selectedOppDetail.contacts.length > 0 },
                            { step: "Evaluated", active: !!selectedOppDetail.opportunity.can_deliver },
                            { step: "Outreach", active: selectedOppDetail.emails && selectedOppDetail.emails[0]?.status === "Sent" },
                            { step: "CRM Synced", active: selectedOppDetail.opportunity.status === "Proposal Sent" || selectedOppDetail.opportunity.status === "Won" }
                          ].map((node, i) => (
                            <div key={i} className="flex flex-col items-center z-10">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold font-mono transition-all duration-300 ${
                                node.active 
                                  ? "bg-gradient-to-r from-emerald-500 to-teal-400 text-[#09090b] shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                                  : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                              }`}>
                                {i + 1}
                              </div>
                              <span className={`text-[8px] font-mono mt-1.5 transition-colors duration-300 ${node.active ? 'text-zinc-200 font-bold' : 'text-zinc-650'}`}>
                                {node.step}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* AI Matching Analysis */}
                      <div className="space-y-3 bg-zinc-900/40 p-4 rounded-lg border border-zinc-850">
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                          <span>CAN WORITY DELIVER?</span>
                          <span className={`font-bold ${selectedOppDetail.opportunity.can_deliver === 'YES' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {selectedOppDetail.opportunity.can_deliver} ({selectedOppDetail.opportunity.delivery_confidence}% Conf)
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-300 leading-relaxed font-sans">{selectedOppDetail.opportunity.delivery_explanation}</p>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {selectedOppDetail.opportunity.service_mapping.map((svc: string, idx: number) => (
                            <span key={idx} className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                              {svc}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Bid/No-Bid Compliance Card */}
                      {bidCompliance && (
                        <div className="space-y-3 bg-[#09090b] p-4 rounded-lg border border-zinc-800">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider flex items-center space-x-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                              <span>Bid/No-Bid Compliance Checker</span>
                            </span>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                              bidCompliance.score >= 75 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {bidCompliance.recommendation} ({bidCompliance.score}%)
                            </span>
                          </div>
                          
                          <p className="text-[10px] text-zinc-400 leading-relaxed font-sans">{bidCompliance.explanation}</p>
                          
                          {/* Checklist items */}
                          <div className="space-y-1.5 pt-1 border-t border-zinc-900">
                            {bidCompliance.checklist.map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between text-[9px] font-mono">
                                <span className="text-zinc-500 flex items-center space-x-1">
                                  <span>•</span>
                                  <span title={item.description}>{item.criterion}</span>
                                </span>
                                <span className={`font-bold ${item.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {item.passed ? 'PASSED' : 'FAILED'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Primary Outreach Email Sequence (Shown First) */}
                      {selectedOppDetail.emails && selectedOppDetail.emails.length > 0 && (
                        <div className="space-y-2 border border-emerald-500/25 bg-emerald-500/5 p-4 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5">
                              <Mail className="w-3.5 h-3.5" />
                              <span>Primary Outreach Email (Ready to Send)</span>
                            </span>
                            <button 
                              onClick={() => handleCopy(`Subject: ${selectedOppDetail.emails[0].subject}\n\n${selectedOppDetail.emails[0].body}`, "detail-quick-email")}
                              className="text-[10px] text-emerald-400 hover:text-emerald-350 font-mono flex items-center space-x-1"
                            >
                              {copiedId === "detail-quick-email" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedId === "detail-quick-email" ? "Copied" : "Copy Email"}</span>
                            </button>
                          </div>
                          <div className="p-3 bg-[#09090b]/80 border border-zinc-800 rounded text-[11px] leading-relaxed font-sans text-zinc-300 space-y-2 max-h-[220px] overflow-y-auto">
                            <p className="font-semibold text-zinc-200 border-b border-zinc-850 pb-1.5">Subject: {selectedOppDetail.emails[0].subject}</p>
                            <p className="whitespace-pre-wrap">{selectedOppDetail.emails[0].body}</p>
                          </div>
                          
                          {/* Send Email Action Button */}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-zinc-500 font-mono">
                              Recipient: {selectedOppDetail.contacts[0]?.email || 'No email discovered'}
                            </span>
                            {selectedOppDetail.emails[0].status === "Sent" ? (
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded font-mono font-bold flex items-center space-x-1">
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Dispatched Successfully</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleSendEmail(selectedOppDetail.emails[0].id, selectedOppDetail.opportunity.id)}
                                disabled={isSendingEmail !== null || !selectedOppDetail.contacts[0]?.email}
                                className="inline-flex items-center space-x-1.5 px-3 py-1 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-[#09090b] font-bold rounded text-[10px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isSendingEmail === selectedOppDetail.emails[0].id ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Sending...</span>
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-3.5 h-3.5" />
                                    <span>Send Outreach Email</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Simulate Inbound Reply Block (Enabled after email dispatch) */}
                      {selectedOppDetail.emails && selectedOppDetail.emails.length > 0 && selectedOppDetail.emails[0].status === "Sent" && (
                        <div className="space-y-3 border border-zinc-800 bg-[#09090b]/40 p-4 rounded-lg">
                          <span className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider flex items-center space-x-1.5">
                            <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                            <span>Simulate Prospect Email Reply</span>
                          </span>
                          <p className="text-[10px] text-zinc-500 leading-relaxed font-sans">
                            Test the AI Reply Intent classifier. Choose a template or type a reply to auto-trigger pipeline actions (meetings, referrals, or opt-outs).
                          </p>
                          
                          <div className="flex flex-wrap gap-1.5">
                            <button 
                              onClick={() => setSimReplyText("This looks really interesting. I would love to talk about our custom chatbot requirements. Can we jump on a call this Thursday at 2 PM EST? Here is my Zoom link.")}
                              className="text-[9px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded font-mono font-medium"
                            >
                              📞 Interested Call
                            </button>
                            <button 
                              onClick={() => setSimReplyText("Thanks for reaching out. I am not the correct person for custom AI software. Please email our VP of Tech, James Brown, at james.brown@company.com.")}
                              className="text-[9px] bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 px-2.5 py-1 rounded font-mono font-medium"
                            >
                              🤝 CTO Referral
                            </button>
                            <button 
                              onClick={() => setSimReplyText("We do not have any budget for custom development this quarter. Please remove me from your list. Stop emailing.")}
                              className="text-[9px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded font-mono font-medium"
                            >
                              🛑 Opt Out
                            </button>
                          </div>

                          <textarea 
                            rows={3}
                            placeholder="Type simulated email reply here..."
                            value={simReplyText}
                            onChange={(e) => setSimReplyText(e.target.value)}
                            className="w-full bg-[#050507] border border-zinc-800 rounded p-2 text-[10px] font-mono text-zinc-300 focus:outline-none focus:border-zinc-700 resize-none"
                          />

                          <div className="flex justify-end">
                            <button
                              onClick={async () => {
                                if (!simReplyText.trim()) return;
                                setIsSimulatingReply(true);
                                try {
                                  const res = await fetch(`${API_BASE}/emails/${selectedOppDetail.emails[0].id}/reply`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ reply_text: simReplyText })
                                  });
                                  if (res.ok) {
                                    const data = await res.json();
                                    alert(`AI Response Intent Classified: ${data.sentiment}\nAction Executed: ${data.explanation}`);
                                    setSimReplyText("");
                                    loadDashboardData();
                                    loadOpportunityDetail(selectedOppDetail.opportunity.id);
                                  } else {
                                    alert("Simulation failed.");
                                  }
                                } catch (err) {
                                  console.error(err);
                                } finally {
                                  setIsSimulatingReply(false);
                                }
                              }}
                              disabled={isSimulatingReply || !simReplyText.trim()}
                              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-bold rounded text-[10px] transition-all disabled:opacity-50"
                            >
                              {isSimulatingReply ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>Classifying Reply...</span>
                                </>
                              ) : (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Submit Inbound Reply</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Tabbed Sub-details (Firmographics, Contacts, Campaign, Proposal) */}
                      <div className="space-y-4">
                        
                        {/* Company & Tech Stack */}
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Company Profile</h4>
                          <div className="grid grid-cols-2 gap-2 text-[10px] bg-zinc-900/20 p-3 rounded border border-zinc-900 font-mono">
                            <div><span className="text-zinc-500">Industry:</span> {selectedOppDetail.company.industry}</div>
                            <div><span className="text-zinc-500">Employees:</span> {selectedOppDetail.company.employees}</div>
                            <div><span className="text-zinc-500">Revenue:</span> {selectedOppDetail.company.revenue}</div>
                            <div><span className="text-zinc-500">HQ:</span> {selectedOppDetail.company.headquarters}</div>
                            <div><span className="text-zinc-500">AI Adoption:</span> {selectedOppDetail.company.ai_adoption}</div>
                            <div><span className="text-zinc-500">Website:</span> <a href={selectedOppDetail.company.website} target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline">{selectedOppDetail.company.website}</a></div>
                          </div>
                        </div>

                        {/* Contacts & Decision Makers */}
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Discovered CXOs / Stakeholders</h4>
                          <div className="space-y-2 max-h-[120px] overflow-y-auto pr-1">
                            {selectedOppDetail.contacts.map((c: any) => (
                              <div key={c.id} className="p-2 bg-zinc-900/60 rounded flex items-center justify-between border border-zinc-850/50">
                                <div>
                                  <p className="text-[11px] font-semibold text-zinc-200">{c.full_name}</p>
                                  <p className="text-[9px] text-zinc-500 font-mono">{c.designation} ({c.department})</p>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                                    c.email.includes("General") ? "bg-zinc-800 text-zinc-500" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  }`}>
                                    {c.email}
                                  </span>
                                  <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-[9px] text-blue-400 hover:underline mt-0.5 font-mono">LinkedIn Profile</a>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Quick Action buttons */}
                        <div className="flex flex-col gap-2 pt-2">
                          <button
                            onClick={() => handleSyncCRM(selectedOppDetail.opportunity.id)}
                            disabled={isSyncingCRM !== null}
                            className="w-full inline-flex items-center justify-center space-x-2 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-[#09090b] font-bold rounded-lg text-xs transition-all shadow-[0_0_10px_rgba(16,185,129,0.15)] disabled:opacity-50"
                          >
                            {isSyncingCRM === selectedOppDetail.opportunity.id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Syncing to {settings.target_crm}...</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Sync to {settings.target_crm}</span>
                              </>
                            )}
                          </button>
                          
                          <div className="flex gap-2 w-full">
                            <button 
                              onClick={() => { setActiveMenu("campaigns"); }}
                              className="flex-1 inline-flex items-center justify-center space-x-2 py-2 border border-zinc-800 hover:bg-zinc-900 rounded-lg text-xs font-semibold text-zinc-300 transition-colors"
                            >
                              <Mail className="w-3.5 h-3.5 text-emerald-400" />
                              <span>View Campaigns</span>
                            </button>
                            
                            <button 
                              onClick={() => { setIsDsrOpen(true); }}
                              className="flex-1 inline-flex items-center justify-center space-x-2 py-2 bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 rounded-lg text-xs font-semibold text-emerald-400 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open DSR Portal</span>
                            </button>
                          </div>
                        </div>

                      </div>

                    </div>
                  ) : null}
                </div>

              </div>

            </div>
          )}

          {/* 4. CRM - COMPANIES */}
          {activeMenu === "companies" && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-zinc-900">
                <h3 className="text-sm font-semibold tracking-wide text-zinc-200">Enriched Companies CRM</h3>
                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Maintain firmographic data for client prospects</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-500 font-mono text-[10px] uppercase">
                      <th className="p-4">Company Name</th>
                      <th className="p-4">Website</th>
                      <th className="p-4">Industry</th>
                      <th className="p-4">Company Size</th>
                      <th className="p-4">Revenue Band</th>
                      <th className="p-4">LinkedIn Profile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {companies.map((c) => (
                      <tr key={c.id} className="hover:bg-zinc-900/40">
                        <td className="p-4 font-semibold text-zinc-200">{c.name}</td>
                        <td className="p-4">
                          <a href={c.website} target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline flex items-center space-x-1">
                            <span>{c.website}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </td>
                        <td className="p-4 text-zinc-300">{c.industry || "N/A"}</td>
                        <td className="p-4 text-zinc-400">{c.employees || "N/A"} employees</td>
                        <td className="p-4 text-zinc-400">{c.revenue || "N/A"}</td>
                        <td className="p-4">
                          <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-[11px] font-mono">
                            {c.linkedin_url}
                          </a>
                        </td>
                      </tr>
                    ))}
                    {companies.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center p-8 text-zinc-500 font-mono">
                          CRM companies directory is empty.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. CRM - CONTACTS */}
          {activeMenu === "contacts" && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-zinc-900 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-semibold tracking-wide text-zinc-200">Discovered Decision Makers</h3>
                  <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Top-tier CXOs, engineering heads, and recruiters</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-500 font-mono text-[10px] uppercase">
                      <th className="p-4">Contact Person</th>
                      <th className="p-4">Title / Role</th>
                      <th className="p-4">Company</th>
                      <th className="p-4">Business Email</th>
                      <th className="p-4">Buying Authority</th>
                      <th className="p-4">LinkedIn Profile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {contacts.map((c) => (
                      <tr key={c.id} className="hover:bg-zinc-900/40">
                        <td className="p-4">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-zinc-200">{c.full_name}</span>
                            {c.is_cxo && (
                              <span className="text-[9px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 rounded">CXO</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-zinc-300">{c.designation}</td>
                        <td className="p-4 text-zinc-400">{c.company_name}</td>
                        <td className="p-4">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-zinc-300">{c.email}</span>
                            <span className="text-[9px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">Verified</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                            c.buying_authority === 'High' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                            c.buying_authority === 'Medium' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-zinc-800 text-zinc-400'
                          }`}>
                            {c.buying_authority}
                          </span>
                        </td>
                        <td className="p-4">
                          <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-[11px] font-mono">
                            {c.linkedin_url}
                          </a>
                        </td>
                      </tr>
                    ))}
                    {contacts.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center p-8 text-zinc-500 font-mono">
                          No stakeholders enrolled in CRM directory.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. EMAIL CAMPAIGNS */}
          {activeMenu === "campaigns" && (
            <div className="space-y-6">
              <div className="bg-zinc-950 p-6 border border-zinc-800 rounded-xl">
                <h3 className="text-sm font-semibold tracking-wide text-zinc-200">Personalized Sales Campaigns</h3>
                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Verify and copy personalized outreach channels for targets</p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                
                {/* Campaigns List */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2">Available Campaigns</h4>
                  <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                    {opportunities
                      .filter(o => o.status === "Completed" || o.status === "Proposal Sent")
                      .map((opp) => (
                        <div 
                          key={opp.id}
                          onClick={() => setSelectedOppId(opp.id)}
                          className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                            selectedOppId === opp.id 
                              ? 'bg-zinc-800/25 border-zinc-700' 
                              : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-750'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <h5 className="text-xs font-semibold text-zinc-200 truncate pr-2">{opp.title}</h5>
                            <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">Campaign Active</span>
                          </div>
                          <p className="text-[10px] text-zinc-500 mt-1 truncate">{opp.company_name}</p>
                        </div>
                      ))}
                    {opportunities.filter(o => o.status === "Completed" || o.status === "Proposal Sent").length === 0 && (
                      <p className="text-xs text-zinc-500 text-center py-8">No active outreach campaigns. Process opportunities first.</p>
                    )}
                  </div>
                </div>

                {/* Email Viewer Panel */}
                <div className="xl:col-span-2">
                  {selectedOppId === null || loadingDetail || !selectedOppDetail || selectedOppDetail.emails.length === 0 ? (
                    <div className="bg-zinc-950 border border-zinc-800 p-8 rounded-xl text-center text-zinc-500 flex flex-col items-center justify-center min-h-[300px]">
                      <Mail className="w-8 h-8 text-zinc-700 mb-3" />
                      <p className="text-xs font-mono">Select a campaign from the sidebar to inspect outreach copies.</p>
                    </div>
                  ) : (
                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
                      {/* Header */}
                      <div className="p-4 bg-zinc-900/40 border-b border-zinc-800 flex justify-between items-center">
                        <div>
                          <h4 className="text-xs font-semibold text-zinc-200">Outreach sequence for {selectedOppDetail.opportunity.company_name}</h4>
                          <p className="text-[9px] text-zinc-500 font-mono">Target: {selectedOppDetail.contacts[0]?.full_name} ({selectedOppDetail.contacts[0]?.designation})</p>
                        </div>
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                          Tone: {selectedOppDetail.emails[0].tone}
                        </span>
                      </div>

                      {/* Copy Blocks */}
                      <div className="p-6 space-y-6">
                        
                        {/* Cold Email */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-mono text-zinc-500 uppercase">1. COLD EMAIL (INTRO)</span>
                            <button 
                              onClick={() => handleCopy(`Subject: ${selectedOppDetail.emails[0].subject}\n\n${selectedOppDetail.emails[0].body}`, "cold-email")}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center space-x-1"
                            >
                              {copiedId === "cold-email" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedId === "cold-email" ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                          <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-lg text-xs leading-relaxed font-sans text-zinc-300 space-y-3">
                            <p className="font-semibold text-zinc-200 border-b border-zinc-900 pb-2">Subject: {selectedOppDetail.emails[0].subject}</p>
                            <p className="whitespace-pre-wrap">{selectedOppDetail.emails[0].body}</p>
                          </div>
                        </div>

                        {/* Follow-up 1 */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-mono text-zinc-500 uppercase">2. FOLLOW-UP 1 (3 DAYS LATER)</span>
                            <button 
                              onClick={() => handleCopy(selectedOppDetail.emails[0].follow_up_1, "follow1")}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center space-x-1"
                            >
                              {copiedId === "follow1" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedId === "follow1" ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                          <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-lg text-xs leading-relaxed font-sans text-zinc-300">
                            <p className="whitespace-pre-wrap">{selectedOppDetail.emails[0].follow_up_1}</p>
                          </div>
                        </div>

                        {/* LinkedIn Outreach */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-mono text-zinc-500 uppercase">3. LINKEDIN MESSAGE</span>
                            <button 
                              onClick={() => handleCopy(selectedOppDetail.emails[0].linkedin_message, "linkedin-out")}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center space-x-1"
                            >
                              {copiedId === "linkedin-out" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedId === "linkedin-out" ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                          <div className="p-4 bg-zinc-900/60 border border-zinc-850 rounded-lg text-xs leading-relaxed font-sans text-zinc-300">
                            <p className="whitespace-pre-wrap">{selectedOppDetail.emails[0].linkedin_message}</p>
                          </div>
                        </div>

                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* 7. AUDIT LOGS */}
          {activeMenu === "logs" && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-zinc-900">
                <h3 className="text-sm font-semibold tracking-wide text-zinc-200">System Activity & Audit Logs</h3>
                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Real-time status updates of requirements, duplicate detections, and enrichment pipelines</p>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {logs.map((log, idx) => (
                    <div 
                      key={idx} 
                      className={`p-4 rounded-lg border text-xs leading-relaxed flex items-start space-x-4 ${
                        log.type === "duplicate" 
                          ? "bg-rose-950/20 border-rose-900/40 text-rose-300" 
                          : log.status === "Success" 
                            ? "bg-emerald-950/15 border-emerald-900/30 text-emerald-300"
                            : "bg-zinc-900/60 border-zinc-850 text-zinc-300"
                      }`}
                    >
                      <div className="shrink-0 mt-0.5">
                        {log.type === "duplicate" ? (
                          <AlertTriangle className="w-4 h-4 text-rose-500" />
                        ) : log.status === "Success" ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-zinc-400" />
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">{log.action || "Pipeline log"}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">{log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-400">{log.details}</p>
                      </div>
                    </div>
                  ))}
                  {logs.length === 0 && (
                    <p className="text-xs text-zinc-500 text-center py-12 font-mono">No logs generated yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 9. KNOWLEDGE BASE PANEL (RAG) */}
          {activeMenu === "knowledge" && (
            <div className="max-w-4xl mx-auto space-y-8">
              
              {/* Add Document Form */}
              <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-xl space-y-6">
                <div>
                  <h3 className="text-sm font-semibold tracking-wide text-zinc-200">Vector Knowledge Base (RAG)</h3>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1">
                    Paste Wority capability statements, case studies, or proposal templates. The system will vectorize them using pgvector to customize all generated proposals.
                  </p>
                </div>

                <form onSubmit={handleAddDocument} className="space-y-4">
                  <div className="grid grid-cols-1 gap-2">
                    <label className="text-[10px] font-mono text-zinc-400 uppercase">Document Title / Case Name</label>
                    <input 
                      type="text"
                      placeholder="e.g. AI voice bots and Twilio case study"
                      value={newDocTitle}
                      onChange={(e) => setNewDocTitle(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <label className="text-[10px] font-mono text-zinc-400 uppercase">Document Content / Text Description</label>
                    <textarea 
                      rows={8}
                      placeholder="Paste capability statements or detailed project scopes here..."
                      value={newDocContent}
                      onChange={(e) => setNewDocContent(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded p-2.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-zinc-700 resize-y"
                      required
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isAddingDoc || !newDocTitle.trim() || !newDocContent.trim()}
                      className="inline-flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-[#09090b] font-bold rounded-lg text-xs transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] disabled:opacity-50"
                    >
                      {isAddingDoc ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Vectorizing & Saving...</span>
                        </>
                      ) : (
                        <>
                          <PlusSquare className="w-3.5 h-3.5" />
                          <span>Save to Vector Store</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Vectorized Documents List */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-zinc-900">
                  <h4 className="text-xs font-semibold tracking-wide text-zinc-200">Vectorized Capability Documents</h4>
                  <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Currently indexed for semantic retrieval during proposal writing</p>
                </div>
                <div className="divide-y divide-zinc-900 max-h-[300px] overflow-y-auto">
                  {documents.map((doc) => (
                    <div key={doc.id} className="p-4 flex items-start justify-between hover:bg-zinc-900/25 transition-colors">
                      <div className="space-y-1 overflow-hidden pr-4">
                        <h5 className="text-xs font-bold text-zinc-200 truncate">{doc.filename}</h5>
                        <p className="text-[10px] text-zinc-500 font-mono truncate">{doc.content}</p>
                        <p className="text-[9px] text-zinc-650 font-mono">Indexed at {new Date(doc.created_at).toLocaleString()}</p>
                      </div>
                      <button 
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="text-[10px] text-rose-400 hover:text-rose-300 font-mono border border-rose-950 bg-rose-950/20 px-2.5 py-1 rounded"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  {documents.length === 0 && (
                    <p className="p-8 text-center text-zinc-500 text-xs font-mono">Vector index is currently empty. Add documents above.</p>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* 8. SETTINGS PANEL */}
          {activeMenu === "settings" && (
            <div className="max-w-3xl mx-auto bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-zinc-900">
                <h3 className="text-sm font-semibold tracking-wide text-zinc-200">System Configurations</h3>
                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Configure AI confidence values, CRM targets, and enrichment providers</p>
              </div>

              <div className="p-6 space-y-6">
                
                {/* Confidence threshold */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-300 block">AI Confidence Approval Threshold</label>
                  <p className="text-[10px] text-zinc-500">Flag requirements for manual review if AI matching confidence falls below this percentage.</p>
                  <div className="flex items-center space-x-4">
                    <input 
                      type="range" 
                      min="50" 
                      max="95" 
                      value={settings.confidence_threshold} 
                      onChange={(e) => setSettings({ ...settings, confidence_threshold: parseInt(e.target.value) })}
                      className="flex-1 accent-emerald-500"
                    />
                    <span className="text-xs font-mono font-bold text-emerald-400 w-8">{settings.confidence_threshold}%</span>
                  </div>
                </div>

                {/* Enrichment providers checkbox */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-300 block">Active Enrichment Providers</label>
                  <div className="grid grid-cols-3 gap-2">
                    {["Apollo", "Hunter", "Clearbit", "RocketReach", "LinkedIn"].map((prov) => (
                      <div key={prov} className="flex items-center space-x-2 bg-zinc-900/60 p-2.5 rounded border border-zinc-850">
                        <input 
                          type="checkbox" 
                          checked={settings.active_enrichment_providers.includes(prov)}
                          onChange={() => {
                            const active = [...settings.active_enrichment_providers];
                            if (active.includes(prov)) {
                              setSettings({ ...settings, active_enrichment_providers: active.filter(p => p !== prov) });
                            } else {
                              setSettings({ ...settings, active_enrichment_providers: [...active, prov] });
                            }
                          }}
                          className="accent-emerald-500 rounded border-zinc-700"
                        />
                        <span className="text-[11px] text-zinc-300 font-mono">{prov}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Auto-Pilot Toggle */}
                <div className="bg-zinc-900/40 p-4 rounded-lg border border-zinc-850 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-300 font-mono uppercase tracking-wider">Auto-Pilot Mode</h4>
                      <p className="text-[10px] text-zinc-500">Automatically dispatch cold outreach email sequences and LinkedIn connection invitations immediately upon CXO contact discovery.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={settings.auto_pilot_enabled}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setSettings({ ...settings, auto_pilot_enabled: val });
                          try {
                            await fetch(`${API_BASE}/settings`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ auto_pilot: val })
                            });
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-[#09090b]"></div>
                    </label>
                  </div>
                </div>

                {/* CRM Destination */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-300 block">Target CRM system</label>
                    <select 
                      value={settings.target_crm} 
                      onChange={(e) => setSettings({ ...settings, target_crm: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 text-xs rounded p-2.5 text-zinc-300 focus:outline-none focus:border-zinc-700"
                    >
                      <option value="HubSpot">HubSpot CRM</option>
                      <option value="Zoho">Zoho CRM</option>
                      <option value="GoogleSheets">Google Sheets</option>
                      <option value="Pipedrive">Pipedrive</option>
                      <option value="Salesforce">Salesforce</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-300 block">Default Email Outreach Tone</label>
                    <select 
                      value={settings.default_email_tone} 
                      onChange={(e) => setSettings({ ...settings, default_email_tone: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 text-xs rounded p-2.5 text-zinc-300 focus:outline-none focus:border-zinc-700"
                    >
                      <option value="Consultative">Consultative</option>
                      <option value="Professional">Professional</option>
                      <option value="Executive">Executive</option>
                      <option value="Human">Human</option>
                    </select>
                  </div>
                </div>

                {/* Save button */}
                <div className="pt-4 border-t border-zinc-900 flex justify-end">
                  <button 
                    onClick={() => alert("Settings saved successfully!")}
                    className="px-5 py-2 bg-emerald-500 text-[#09090b] font-bold rounded-lg text-xs hover:bg-emerald-400 transition-colors"
                  >
                    Save Configuration
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* 10. DIGITAL SALES ROOM (DSR) PROPOSAL HUB OVERLAY */}
          {isDsrOpen && selectedOppDetail && (
            <div className="fixed inset-0 z-50 bg-[#09090b]/80 backdrop-blur-md flex items-center justify-center p-4">
              <div className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
                
                {/* Branded Header */}
                <div className="p-6 bg-[#0c0c0e] border-b border-zinc-900 flex justify-between items-center">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-[#09090b]">W</div>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100">Wority Collaboration Hub</h3>
                      <p className="text-[10px] text-zinc-500 font-mono">Secure Client Portal • Prepared for {selectedOppDetail.company.name}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsDsrOpen(false)}
                    className="text-zinc-500 hover:text-zinc-300 text-xs font-mono border border-zinc-800 px-3 py-1 rounded"
                  >
                    Close Portal
                  </button>
                </div>

                {/* DSR Body */}
                <div className="p-8 overflow-y-auto space-y-8 flex-1">
                  
                  {/* Proposal Title Hero */}
                  <div className="space-y-2 border-b border-zinc-900 pb-6">
                    <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-bold uppercase">
                      Service Proposal & Scope of Work
                    </span>
                    <h2 className="text-xl font-bold text-zinc-100">{selectedOppDetail.opportunity.title}</h2>
                    <p className="text-xs text-zinc-400 leading-relaxed font-sans mt-2">{selectedOppDetail.proposals[0]?.executive_summary || "Proposal Draft"}</p>
                  </div>

                  {/* Recommended Solution Architecture grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3 p-5 bg-zinc-900/35 border border-zinc-850 rounded-xl">
                      <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">Proposed Engineering Architecture</h4>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">{selectedOppDetail.proposals[0]?.architecture}</p>
                      
                      <div className="pt-2">
                        <span className="text-[9px] text-zinc-500 font-mono block mb-1">PROPOSED TECH STACK:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {(selectedOppDetail.proposals[0]?.technology_stack || ["React", "Python", "PostgreSQL", "Docker"]).map((tech: string, i: number) => (
                            <span key={i} className="text-[9px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">{tech}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 p-5 bg-zinc-900/35 border border-zinc-850 rounded-xl">
                      <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">Staffing Pod & Timeframe</h4>
                      <p className="text-[11px] text-zinc-400 leading-relaxed"><span className="text-zinc-500 font-mono">Team Pod:</span> {selectedOppDetail.proposals[0]?.team_structure}</p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed"><span className="text-zinc-500 font-mono">Milestone Tracks:</span> {selectedOppDetail.proposals[0]?.timeline}</p>
                      <div className="pt-2 flex justify-between items-center border-t border-zinc-900">
                        <span className="text-[10px] text-zinc-500 font-mono">ESTIMATED INVESTMENT:</span>
                        <span className="text-sm font-bold text-emerald-400 font-mono">{selectedOppDetail.proposals[0]?.estimated_cost_range}</span>
                      </div>
                    </div>
                  </div>

                  {/* Case Study context (RAG) */}
                  <div className="p-5 bg-zinc-900/10 border border-zinc-850 rounded-xl space-y-2">
                    <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center space-x-1.5">
                      <Database className="w-4 h-4 text-emerald-400" />
                      <span>Why Wority Technology (RAG Credentials)</span>
                    </h4>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">{selectedOppDetail.proposals[0]?.why_wority}</p>
                  </div>

                  {/* Client Action Area / Mock Checkout Sign */}
                  <div className="bg-emerald-500/5 border border-emerald-500/15 p-6 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-emerald-400 font-mono uppercase tracking-wider">Ready to schedule kickoff?</h4>
                      <p className="text-[10px] text-zinc-400">Click below to sign the digital scope of work and schedule your developer onboarding.</p>
                    </div>
                    {selectedOppDetail.opportunity.status === "Won" ? (
                      <span className="px-6 py-2.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-bold rounded-lg text-xs font-mono">
                        PROPOSAL APPROVED & SIGNED ✓
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSignProposal(selectedOppDetail.opportunity.id)}
                        className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-[#09090b] font-bold rounded-lg text-xs transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                      >
                        Approve Proposal & Sign Scope
                      </button>
                    )}
                  </div>

                </div>

              </div>
            </div>
          )}

        </div>
      </main>

    </div>
  );
}
