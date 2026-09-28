/**
 * AquaBloom Authoritative Supplier Product Catalog — Step 3
 * 
 * Provides approved manufacturing suppliers with comprehensive master-data management:
 * 1. Product configuration (Materials, Volume, Shape, Cap, Finish, Printing)
 * 2. Inclusive customer-facing pricing (INR only, bottle + label + print included)
 * 3. Operational availability (AVAILABLE, LIMITED, UNAVAILABLE)
 * 4. Lifecycle state machine (DRAFT, ACTIVE, INACTIVE, DISCONTINUED)
 * 5. Versioning & Effective Dating historical audit
 * 6. Controlled deletion exclusively for DRAFT records
 */

import React, { useState, useEffect } from 'react';
import {
  Product,
  ProductVersion,
  ProductStatus,
  ProductAvailability,
  SupplierProfile,
  CreateProductInput,
  CreateProductVersionInput,
} from '../../types.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.js';
import { ProductEditorModal } from './ProductEditorModal.js';
import {
  Package,
  Plus,
  Search,
  Filter,
  Layers,
  IndianRupee,
  Clock,
  History,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Power,
  Archive,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

export const ProductCatalog: React.FC = () => {
  const { user, profile } = useAuth();
  const supplierProfile = profile as SupplierProfile | null;
  const isApprovedSupplier = supplierProfile?.approvalStatus === 'APPROVED' && user?.status === 'ACTIVE';

  // Catalog State
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProductStatus>('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<'ALL' | ProductAvailability>('ALL');

  // Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'CREATE' | 'NEW_VERSION' | 'EDIT_METADATA'>('CREATE');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Version History Drawer State (Product ID -> list of versions)
  const [expandedVersionsProductId, setExpandedVersionsProductId] = useState<string | null>(null);
  const [versionHistoryMap, setVersionHistoryMap] = useState<Record<string, ProductVersion[]>>({});
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // Deletion Confirmation Modal State
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Load Supplier Products
  const loadProducts = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const res = await api.getSupplierProducts();
      if (res.data) {
        setProducts(res.data);
      } else if (res.error) {
        setActionError(res.error.message);
      }
    } catch {
      setActionError('Failed to load supplier product catalog.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // Flash temporary success notification
  const notifySuccess = (message: string) => {
    setSuccessNotice(message);
    setTimeout(() => setSuccessNotice(null), 4000);
  };

  // Handle Product Creation
  const handleSaveProduct = async (input: CreateProductInput): Promise<boolean> => {
    setActionError(null);
    const res = await api.createProduct(input);
    if (res.data) {
      notifySuccess(`Product '${res.data.product.name}' (${res.data.product.publicProductId}) created.`);
      await loadProducts();
      return true;
    } else {
      setActionError(res.error?.message || 'Failed to create product master record.');
      return false;
    }
  };

  // Handle Version Creation (material revision)
  const handleSaveVersion = async (productId: string, input: CreateProductVersionInput): Promise<boolean> => {
    setActionError(null);
    const res = await api.createProductVersion(productId, input);
    if (res.data) {
      notifySuccess(`Version ${res.data.version.versionNumber} published for ${res.data.product.publicProductId}.`);
      await loadProducts();
      if (expandedVersionsProductId === productId) {
        loadVersionHistory(productId);
      }
      return true;
    } else {
      setActionError(res.error?.message || 'Failed to publish revised product version.');
      return false;
    }
  };

  // Handle Status Transitions
  const handleStatusChange = async (product: Product, targetStatus: ProductStatus) => {
    setActionError(null);
    try {
      const res = await api.updateProductStatus(product.id, targetStatus);
      if (res.data) {
        notifySuccess(`Status of ${product.publicProductId} transitioned to ${targetStatus}.`);
        await loadProducts();
      } else {
        setActionError(res.error?.message || 'Failed to transition product status.');
      }
    } catch {
      setActionError('Error communicating with product status engine.');
    }
  };

  // Handle Availability Change
  const handleAvailabilityChange = async (product: Product, targetAvailability: ProductAvailability) => {
    setActionError(null);
    try {
      const res = await api.updateProductAvailability(product.id, targetAvailability);
      if (res.data) {
        notifySuccess(`Availability for ${product.publicProductId} updated to ${targetAvailability}.`);
        await loadProducts();
      } else {
        setActionError(res.error?.message || 'Failed to update availability.');
      }
    } catch {
      setActionError('Error communicating with availability service.');
    }
  };

  // Handle Draft Deletion
  const handleDeleteDraft = async () => {
    if (!productToDelete) return;
    setActionError(null);
    try {
      const res = await api.deleteDraftProduct(productToDelete.id);
      if (res.data) {
        notifySuccess(`Draft product ${productToDelete.publicProductId} deleted.`);
        setProductToDelete(null);
        await loadProducts();
      } else {
        setActionError(res.error?.message || 'Failed to delete draft product.');
      }
    } catch {
      setActionError('Error deleting draft product.');
    }
  };

  // Toggle and load version history for a product
  const toggleVersionHistory = async (product: Product) => {
    if (expandedVersionsProductId === product.id) {
      setExpandedVersionsProductId(null);
      return;
    }

    setExpandedVersionsProductId(product.id);
    await loadVersionHistory(product.id);
  };

  const loadVersionHistory = async (productId: string) => {
    setIsLoadingVersions(true);
    try {
      const res = await api.getProduct(productId);
      if (res.data && 'versions' in res.data && res.data.versions) {
        setVersionHistoryMap((prev) => ({
          ...prev,
          [productId]: (res.data as { versions: ProductVersion[] }).versions,
        }));
      }
    } finally {
      setIsLoadingVersions(false);
    }
  };

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    // Status Filter
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
    // Availability Filter
    if (availabilityFilter !== 'ALL' && p.availability !== availabilityFilter) return false;
    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchDesc = p.description.toLowerCase().includes(q);
      const matchId = p.publicProductId.toLowerCase().includes(q);
      const matchCat = p.category.toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchId && !matchCat) return false;
    }
    return true;
  });

  // Aggregate Metrics
  const activeCount = products.filter((p) => p.status === 'ACTIVE').length;
  const draftCount = products.filter((p) => p.status === 'DRAFT').length;
  const discontinuedCount = products.filter((p) => p.status === 'DISCONTINUED').length;

  return (
    <div className="space-y-6">
      {/* 1. Supplier Eligibility Banner */}
      {!isApprovedSupplier ? (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-xs">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-200">
                Supplier Operational Approval Pending ({supplierProfile?.approvalStatus || 'PENDING_REVIEW'})
              </h3>
              <p className="mt-1 text-amber-300/80 leading-relaxed">
                Your plant profile is currently pending review by AquaBloom Administration. While you may prepare draft bottle configurations, products cannot be activated or supplied for campaign orders until your profile is officially approved.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-3.5 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span className="font-semibold">
              Plant Verified &amp; Approved &bull; Authorized for Authoritative Catalog Master Data
            </span>
          </div>
          <span className="rounded-full bg-emerald-900/40 border border-emerald-700/50 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-300">
            INR Master Currency
          </span>
        </div>
      )}

      {/* Notifications */}
      {actionError && (
        <div className="flex items-center justify-between rounded-xl border border-rose-900/60 bg-rose-950/40 p-4 text-xs text-rose-300">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-rose-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {successNotice && (
        <div className="flex items-center space-x-2 rounded-xl border border-emerald-900/60 bg-emerald-950/40 p-4 text-xs text-emerald-300">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* 2. Catalog Header & Metrics */}
      <div className="rounded-2xl border border-[#21212f] bg-[#0c0c12] p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Package className="h-4 w-4" />
              <span>Authoritative Master-Data Catalog</span>
            </div>
            <h2 className="mt-1 font-display text-xl font-bold text-white sm:text-2xl">
              Manufactured Bottle Configurations
            </h2>
            <p className="mt-1 text-xs text-[#8c8c9e] max-w-2xl">
              Define the physical bottle formats, volumes, label dielines, and inclusive customer-facing pricing your plant supplies.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                setSelectedProduct(null);
                setEditorMode('CREATE');
                setIsEditorOpen(true);
              }}
              className="flex items-center space-x-2 rounded-xl bg-[#c5a059] px-4 py-2.5 text-xs font-bold text-black hover:bg-[#d4af37] transition shadow-md"
            >
              <Plus className="h-4 w-4" />
              <span>Add New Product</span>
            </button>
          </div>
        </div>

        {/* Aggregate Stats */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-[#1c1c28] pt-6 text-xs">
          <div className="rounded-xl border border-[#1e1e2b] bg-[#12121a] p-3.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
              Total Products
            </span>
            <p className="mt-1 font-mono text-xl font-bold text-white">{products.length}</p>
          </div>
          <div className="rounded-xl border border-[#1e1e2b] bg-[#12121a] p-3.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
              Active in Catalog
            </span>
            <p className="mt-1 font-mono text-xl font-bold text-emerald-400">{activeCount}</p>
          </div>
          <div className="rounded-xl border border-[#1e1e2b] bg-[#12121a] p-3.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
              In Draft
            </span>
            <p className="mt-1 font-mono text-xl font-bold text-amber-400">{draftCount}</p>
          </div>
          <div className="rounded-xl border border-[#1e1e2b] bg-[#12121a] p-3.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
              Discontinued / Archived
            </span>
            <p className="mt-1 font-mono text-xl font-bold text-[#808092]">{discontinuedCount}</p>
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-[#21212d] bg-[#0d0d14] p-4 text-xs">
        <div className="relative flex-1">
          <Search className="absolute inset-y-0 left-0 my-auto ml-3 h-4 w-4 text-[#68687a]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by bottle name, material, description, or public ID (AB-PRD-...)"
            className="w-full rounded-lg border border-[#282838] bg-[#14141e] pl-9 pr-4 py-2 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1.5 text-[#737385]">
            <Filter className="h-3.5 w-3.5" />
            <span>Status:</span>
          </div>

          {(['ALL', 'ACTIVE', 'DRAFT', 'INACTIVE', 'DISCONTINUED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                statusFilter === st
                  ? 'bg-[#c5a059] text-black font-bold'
                  : 'bg-[#14141e] text-[#868699] hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}

          <div className="h-4 w-[1px] bg-[#2a2a3a] mx-1" />

          <select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value as 'ALL' | ProductAvailability)}
            className="rounded-lg border border-[#282838] bg-[#14141e] px-2.5 py-1 text-[11px] text-[#b0b0c2] focus:border-[#c5a059] focus:outline-none"
          >
            <option value="ALL">All Availabilities</option>
            <option value="AVAILABLE">Available</option>
            <option value="LIMITED">Limited</option>
            <option value="UNAVAILABLE">Unavailable</option>
          </select>
        </div>
      </div>

      {/* 4. Product List View */}
      {isLoading ? (
        <div className="rounded-2xl border border-[#21212d] bg-[#0c0c12] p-12 text-center text-xs text-[#717185]">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#c5a059]" />
          <p className="mt-3">Loading supplier product catalog...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-[#21212d] bg-[#0c0c12] p-12 text-center text-xs text-[#717185]">
          <Package className="mx-auto h-8 w-8 text-[#4a4a5a]" />
          <h3 className="mt-3 text-sm font-bold text-white">No Catalog Products Found</h3>
          <p className="mt-1 text-[#8c8c9e] max-w-md mx-auto">
            {products.length === 0
              ? 'Your manufacturing catalog has no products defined yet. Click "Add New Product" above to create your first bottle specification.'
              : 'No products matched your search or status filter criteria.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProducts.map((product) => {
            const isDiscontinued = product.status === 'DISCONTINUED';
            const isDraft = product.status === 'DRAFT';
            const isVersionsExpanded = expandedVersionsProductId === product.id;
            const versions = versionHistoryMap[product.id] || [];

            return (
              <div
                key={product.id}
                className="rounded-2xl border border-[#21212f] bg-[#0d0d14] p-6 shadow-lg transition hover:border-[#2f2f42]"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1b1b26] pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#c5a059]">
                      {product.publicProductId}
                    </span>
                    <span className="text-[#3b3b4d]">&bull;</span>
                    <span className="rounded-full bg-[#181824] px-2.5 py-0.5 text-[10px] font-semibold text-[#a5a5bb]">
                      {product.category}
                    </span>
                    <span className="rounded-full border border-[#c5a059]/40 bg-[#c5a059]/10 px-2 py-0.5 text-[10px] font-mono font-bold text-[#d4af37]">
                      v{product.currentVersionNumber}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Status Badge */}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        product.status === 'ACTIVE'
                          ? 'border border-emerald-800/40 bg-emerald-950/40 text-emerald-400'
                          : product.status === 'DRAFT'
                          ? 'border border-amber-800/40 bg-amber-950/40 text-amber-300'
                          : product.status === 'INACTIVE'
                          ? 'border border-zinc-700 bg-zinc-800 text-zinc-300'
                          : 'border border-rose-900/40 bg-rose-950/40 text-rose-400'
                      }`}
                    >
                      {product.status}
                    </span>

                    {/* Availability Badge */}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                        product.availability === 'AVAILABLE'
                          ? 'border border-cyan-800/40 bg-cyan-950/30 text-cyan-300'
                          : product.availability === 'LIMITED'
                          ? 'border border-amber-700/40 bg-amber-950/30 text-amber-300'
                          : 'border border-zinc-800 bg-zinc-900 text-zinc-500'
                      }`}
                    >
                      {product.availability}
                    </span>
                  </div>
                </div>

                {/* Main Body */}
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left 2 Cols: Details & Specs */}
                  <div className="lg:col-span-2 space-y-4">
                    <div>
                      <h3 className="text-base font-bold text-white">{product.name}</h3>
                      <p className="mt-1 text-xs text-[#8c8c9e] leading-relaxed">
                        {product.description || 'No description provided.'}
                      </p>
                    </div>

                    {/* Technical Specifications Grid */}
                    <div className="rounded-xl border border-[#1b1b26] bg-[#111119] p-4 text-xs">
                      <div className="flex items-center space-x-2 text-[10px] font-bold uppercase tracking-wider text-[#c5a059] mb-3">
                        <Layers className="h-3.5 w-3.5" />
                        <span>Physical Bottle &amp; Production Specs</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                          <span className="text-[10px] text-[#6d6d80] block">Volume / Unit</span>
                          <span className="font-semibold text-white">
                            {product.specifications.bottleCapacityMl} ml ({product.specifications.bottleType})
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#6d6d80] block">Material</span>
                          <span className="font-semibold text-white">
                            {product.specifications.bottleMaterial}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#6d6d80] block">Shape &amp; Cap</span>
                          <span className="font-semibold text-white">
                            {product.specifications.bottleShape} &bull; {product.specifications.capType}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#6d6d80] block">Finish &amp; Label</span>
                          <span className="font-semibold text-white">
                            {product.specifications.bottleFinish} &bull; {product.specifications.labelType}
                          </span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-[10px] text-[#6d6d80] block">Printing &amp; Finishes</span>
                          <span className="font-semibold text-white">
                            {product.specifications.printingCapability}
                            {product.specifications.finishingOptions?.length > 0 &&
                              ` [${product.specifications.finishingOptions.join(', ')}]`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Col: Commercial Pricing & Parameters */}
                  <div className="rounded-xl border border-[#232332] bg-[#12121b] p-5 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-xs text-[#8c8c9e]">
                        <span>Customer-Facing Price</span>
                        <span className="font-mono text-[10px] text-[#c5a059]">Inclusive</span>
                      </div>
                      <div className="mt-1 flex items-baseline space-x-1">
                        <span className="font-display text-2xl font-bold text-[#c5a059]">
                          ₹{product.customerFacingPrice.amount.toFixed(2)}
                        </span>
                        <span className="text-xs text-[#7b7b8d]">/ bottle</span>
                      </div>
                      <p className="mt-1 text-[10px] text-[#717185] italic leading-tight">
                        *Inclusive of bottle container, full-wrap label, printing &amp; finishing
                      </p>

                      <div className="mt-4 space-y-2 border-t border-[#1e1e2d] pt-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[#7d7d91]">Minimum Order (MOQ):</span>
                          <span className="font-mono font-bold text-white">
                            {product.minimumOrderQuantity.toLocaleString()} units
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#7d7d91]">Lead Time:</span>
                          <span className="font-mono font-bold text-white">
                            {product.productionLeadTime.value} {product.productionLeadTime.unit.toLowerCase()}
                          </span>
                        </div>
                        {product.productionCapacity?.unitsPerMonth && (
                          <div className="flex items-center justify-between">
                            <span className="text-[#7d7d91]">Plant Capacity:</span>
                            <span className="font-mono font-bold text-white">
                              {product.productionCapacity.unitsPerMonth.toLocaleString()} / mo
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Availability Selector */}
                    {!isDiscontinued && (
                      <div className="border-t border-[#1e1e2d] pt-3">
                        <label className="text-[10px] font-semibold uppercase text-[#737385] block mb-1">
                          Quick Availability
                        </label>
                        <select
                          value={product.availability}
                          onChange={(e) =>
                            handleAvailabilityChange(product, e.target.value as ProductAvailability)
                          }
                          className="w-full rounded-lg border border-[#2b2b3b] bg-[#161622] px-2.5 py-1.5 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                        >
                          <option value="AVAILABLE">AVAILABLE (Immediate run)</option>
                          <option value="LIMITED">LIMITED (Constrained)</option>
                          <option value="UNAVAILABLE">UNAVAILABLE (Paused)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Controls & Version Actions */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#1b1b26] pt-4 text-xs">
                  {/* Left: History drawer button */}
                  <button
                    onClick={() => toggleVersionHistory(product)}
                    className="flex items-center space-x-1.5 text-xs text-[#8c8c9e] hover:text-[#c5a059] transition"
                  >
                    <History className="h-4 w-4" />
                    <span>Version History (v{product.currentVersionNumber})</span>
                    {isVersionsExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {/* Right: State Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Discontinue Action */}
                    {!isDiscontinued && (
                      <button
                        onClick={() => handleStatusChange(product, 'DISCONTINUED')}
                        className="rounded-lg border border-rose-900/50 bg-rose-950/20 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-950/40 transition"
                      >
                        Discontinue
                      </button>
                    )}

                    {/* Status Activation / Deactivation */}
                    {isDraft && (
                      <>
                        <button
                          onClick={() => setProductToDelete(product)}
                          className="flex items-center space-x-1 rounded-lg border border-[#2b2b3b] bg-[#15151e] px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-950/30 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete Draft</span>
                        </button>

                        <button
                          disabled={!isApprovedSupplier}
                          onClick={() => handleStatusChange(product, 'ACTIVE')}
                          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                            isApprovedSupplier
                              ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                              : 'opacity-40 cursor-not-allowed bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          Activate Product
                        </button>
                      </>
                    )}

                    {product.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleStatusChange(product, 'INACTIVE')}
                        className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 transition"
                      >
                        Deactivate
                      </button>
                    )}

                    {product.status === 'INACTIVE' && (
                      <button
                        onClick={() => handleStatusChange(product, 'ACTIVE')}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition"
                      >
                        Reactivate
                      </button>
                    )}

                    {/* Material Revision (New Version) */}
                    {!isDiscontinued && (
                      <button
                        onClick={() => {
                          setSelectedProduct(product);
                          setEditorMode('NEW_VERSION');
                          setIsEditorOpen(true);
                        }}
                        className="flex items-center space-x-1 rounded-lg border border-[#c5a059] bg-[#c5a059]/10 px-3 py-1.5 text-xs font-bold text-[#d4af37] hover:bg-[#c5a059]/20 transition"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>Revise / New Version</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Version History Drawer */}
                {isVersionsExpanded && (
                  <div className="mt-4 rounded-xl border border-[#1e1e2d] bg-[#09090e] p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-[#1b1b26] pb-2">
                      <span className="font-bold uppercase tracking-wider text-[#c5a059]">
                        Audit Trail &bull; Historical Version Snapshots
                      </span>
                      <span className="text-[10px] text-[#717185]">
                        Effective-dated commercial records
                      </span>
                    </div>

                    {isLoadingVersions ? (
                      <p className="text-[#717185]">Loading version history...</p>
                    ) : versions.length === 0 ? (
                      <p className="text-[#717185]">No version snapshots found.</p>
                    ) : (
                      <div className="space-y-2">
                        {versions.map((ver) => (
                          <div
                            key={ver.id}
                            className={`rounded-lg border p-3 ${
                              ver.id === product.activeVersionId
                                ? 'border-[#c5a059]/40 bg-[#161622]'
                                : 'border-[#1b1b26] bg-[#0e0e14] opacity-80'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-white">Version {ver.versionNumber}</span>
                                {ver.id === product.activeVersionId && (
                                  <span className="rounded-full bg-emerald-950/60 border border-emerald-700/60 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                                    Current Active
                                  </span>
                                )}
                                <span className="font-mono text-[10px] text-[#8e8ea2]">
                                  {ver.publicVersionId}
                                </span>
                              </div>
                              <span className="font-mono font-bold text-[#c5a059]">
                                ₹{ver.customerFacingPrice.amount.toFixed(2)}
                              </span>
                            </div>

                            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-[#8e8ea2]">
                              <div>
                                <span className="text-[#626274]">Effective From:</span>{' '}
                                {new Date(ver.effectiveFrom).toLocaleDateString()}
                              </div>
                              <div>
                                <span className="text-[#626274]">Effective Until:</span>{' '}
                                {ver.effectiveUntil
                                  ? new Date(ver.effectiveUntil).toLocaleDateString()
                                  : 'Present'}
                              </div>
                              <div>
                                <span className="text-[#626274]">MOQ / Lead Time:</span>{' '}
                                {ver.minimumOrderQuantity.toLocaleString()} u &bull;{' '}
                                {ver.productionLeadTime.value} {ver.productionLeadTime.unit.toLowerCase()}
                              </div>
                            </div>

                            {ver.changeReason && (
                              <p className="mt-2 text-[10px] text-[#a0a0b5] italic">
                                Reason: &ldquo;{ver.changeReason}&rdquo;
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Product Editor / Revision Modal */}
      <ProductEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSaveProduct={handleSaveProduct}
        onSaveVersion={handleSaveVersion}
        existingProduct={selectedProduct}
        mode={editorMode}
        isApprovedSupplier={isApprovedSupplier}
      />

      {/* Delete Draft Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-rose-900/60 bg-[#0e0e14] p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <Trash2 className="h-6 w-6" />
              <h3 className="font-display text-lg font-bold">Delete Draft Product?</h3>
            </div>
            <p className="text-xs text-[#a0a0b5] leading-relaxed">
              Are you sure you want to permanently delete draft product{' '}
              <span className="font-bold text-white">{productToDelete.name}</span> (
              {productToDelete.publicProductId})? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setProductToDelete(null)}
                className="rounded-lg border border-[#2b2b3b] px-4 py-2 text-xs font-semibold text-[#8c8c9e] hover:bg-[#161622] hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDraft}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 transition"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
