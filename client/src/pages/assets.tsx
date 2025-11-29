import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Layers, Search, Trash2, Edit, Check, X, TrendingUp, DollarSign, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Asset, InsertAsset } from "@shared/schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const assetFormSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
  name: z.string().min(1, "Name is required"),
  type: z.enum(["indian_stock", "indian_futures", "forex"]),
  exchange: z.string().optional(),
  enabled: z.boolean().default(true),
});

type AssetFormData = z.infer<typeof assetFormSchema>;

const PRESET_ASSETS = [
  { symbol: "RELIANCE", name: "Reliance Industries", type: "indian_stock", exchange: "NSE" },
  { symbol: "TCS", name: "Tata Consultancy Services", type: "indian_stock", exchange: "NSE" },
  { symbol: "HDFC", name: "HDFC Bank", type: "indian_stock", exchange: "NSE" },
  { symbol: "INFY", name: "Infosys", type: "indian_stock", exchange: "NSE" },
  { symbol: "WIPRO", name: "Wipro", type: "indian_stock", exchange: "NSE" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv", type: "indian_stock", exchange: "NSE" },
  { symbol: "ICICIBANK", name: "ICICI Bank", type: "indian_stock", exchange: "NSE" },
  { symbol: "HDFCBANK", name: "HDFC Bank Limited", type: "indian_stock", exchange: "NSE" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", type: "indian_stock", exchange: "NSE" },
  { symbol: "AXISBANK", name: "Axis Bank", type: "indian_stock", exchange: "NSE" },
  { symbol: "SBIN", name: "State Bank of India", type: "indian_stock", exchange: "NSE" },
  { symbol: "LT", name: "Larsen & Toubro", type: "indian_stock", exchange: "NSE" },
  { symbol: "MARUTI", name: "Maruti Suzuki", type: "indian_stock", exchange: "NSE" },
  { symbol: "ONGC", name: "Oil and Natural Gas Corporation", type: "indian_stock", exchange: "NSE" },
  { symbol: "TATASTEEL", name: "Tata Steel", type: "indian_stock", exchange: "NSE" },
  { symbol: "JSWSTEEL", name: "JSW Steel", type: "indian_stock", exchange: "NSE" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", type: "indian_stock", exchange: "NSE" },
  { symbol: "ITC", name: "ITC Limited", type: "indian_stock", exchange: "NSE" },
  { symbol: "NESTLEIND", name: "Nestlé India", type: "indian_stock", exchange: "NSE" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", type: "indian_stock", exchange: "NSE" },
  { symbol: "DRREDDY", name: "Dr. Reddy's Laboratories", type: "indian_stock", exchange: "NSE" },
  { symbol: "CIPLA", name: "Cipla Limited", type: "indian_stock", exchange: "NSE" },
  { symbol: "APOLLOHOSP", name: "Apollo Hospitals", type: "indian_stock", exchange: "NSE" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv", type: "indian_stock", exchange: "NSE" },
  { symbol: "BAJAJHLDNG", name: "Bajaj Holdings", type: "indian_stock", exchange: "NSE" },
  { symbol: "YESBANK", name: "YES Bank", type: "indian_stock", exchange: "NSE" },
  { symbol: "NIFTYNXT50", name: "Nifty Next 50", type: "indian_futures", exchange: "NSE" },
  { symbol: "BANKNIFTY", name: "Bank Nifty", type: "indian_futures", exchange: "NSE" },
  { symbol: "NIFTY50", name: "Nifty 50", type: "indian_futures", exchange: "NSE" },
  { symbol: "FINNIFTY", name: "Fin Nifty", type: "indian_futures", exchange: "NSE" },
  { symbol: "MIDCPNIFTY", name: "Midcap Nifty", type: "indian_futures", exchange: "NSE" },
  { symbol: "EURUSD", name: "Euro / US Dollar", type: "forex", exchange: "FOREX" },
  { symbol: "GBPUSD", name: "British Pound / US Dollar", type: "forex", exchange: "FOREX" },
  { symbol: "USDJPY", name: "US Dollar / Japanese Yen", type: "forex", exchange: "FOREX" },
  { symbol: "AUDUSD", name: "Australian Dollar / US Dollar", type: "forex", exchange: "FOREX" },
  { symbol: "USDINR", name: "US Dollar / Indian Rupee", type: "forex", exchange: "FOREX" },
  { symbol: "CHFUSD", name: "Swiss Franc / US Dollar", type: "forex", exchange: "FOREX" },
  { symbol: "CADUSD", name: "Canadian Dollar / US Dollar", type: "forex", exchange: "FOREX" },
];

export default function Assets() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("indian");
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<typeof PRESET_ASSETS>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();

  const form = useForm<AssetFormData>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      symbol: "",
      name: "",
      type: "indian_stock",
      exchange: "NSE",
      enabled: true,
    },
  });

  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertAsset) => apiRequest("POST", "/api/assets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      setIsAddDialogOpen(false);
      form.reset();
      toast({
        title: "Asset added",
        description: "The asset has been added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add asset",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Asset> }) =>
      apiRequest("PATCH", `/api/assets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({
        title: "Asset updated",
        description: "The asset has been updated successfully.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/assets/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({
        title: "Asset deleted",
        description: "The asset has been deleted.",
      });
    },
  });

  const onSubmit = (data: AssetFormData) => {
    createMutation.mutate(data);
  };

  const searchAssets = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = PRESET_ASSETS.filter((preset) => {
        const alreadyExists = assets.some((a) => a.symbol === preset.symbol);
        const matchesSearch =
          preset.symbol.toLowerCase().includes(query.toLowerCase()) ||
          preset.name.toLowerCase().includes(query.toLowerCase());
        return matchesSearch && !alreadyExists;
      });
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setAssetSearchQuery(value);
    searchAssets(value);
  };

  const addPresetAsset = (preset: typeof PRESET_ASSETS[0]) => {
    form.setValue("symbol", preset.symbol);
    form.setValue("name", preset.name);
    form.setValue("type", preset.type as any);
    form.setValue("exchange", preset.exchange);
    setAssetSearchQuery("");
    setSearchResults([]);
  };

  const handleToggleAsset = (asset: Asset) => {
    updateMutation.mutate({
      id: asset.id,
      data: { enabled: !asset.enabled },
    });
  };

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch =
      asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || asset.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const stats = {
    total: assets.length,
    enabled: assets.filter((a) => a.enabled).length,
    indianMarket: assets.filter((a) => a.type === "indian_stock" || a.type === "indian_futures").length,
    forex: assets.filter((a) => a.type === "forex").length,
  };

  const indianMarketAssets = assets.filter(
    (a) => a.type === "indian_stock" || a.type === "indian_futures"
  ).filter((a) =>
    a.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const forexAssets = assets.filter((a) => a.type === "forex").filter((a) =>
    a.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold" data-testid="heading-assets">
            Trading Assets
          </h1>
          <p className="text-base text-muted-foreground">
            Monitor and manage your trading instruments
          </p>
        </div>
        <Button
          onClick={() => setIsAddDialogOpen(true)}
          data-testid="button-add-asset"
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Asset</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Total Assets
              </CardTitle>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-total-assets">
              {stats.total}
            </div>
            <p className="text-xs text-muted-foreground mt-1">All instruments</p>
          </CardContent>
        </Card>

        <Card className="border border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Enabled
              </CardTitle>
              <Check className="h-4 w-4 text-chart-1" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-chart-1" data-testid="stat-enabled-assets">
              {stats.enabled}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Active tracking</p>
          </CardContent>
        </Card>

        <Card className="border border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Indian Market
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-chart-2" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-chart-2" data-testid="stat-indian-market">
              {stats.indianMarket}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Stocks & futures</p>
          </CardContent>
        </Card>

        <Card className="border border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Forex
              </CardTitle>
              <DollarSign className="h-4 w-4 text-chart-3" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-chart-3" data-testid="stat-forex">
              {stats.forex}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Currency pairs</p>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by symbol or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-10"
          data-testid="input-search-assets"
        />
      </div>

      {/* Tabs Section */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="pt-16 pb-16">
            <div className="text-center">
              <Layers className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No assets yet</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                Start by adding your first trading instrument to begin tracking signals
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-asset">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Asset
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 h-10">
            <TabsTrigger value="indian" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span>Indian Market</span>
              <Badge variant="secondary" className="ml-1 text-xs font-mono">
                {stats.indianMarket}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="forex" className="gap-2">
              <DollarSign className="h-4 w-4" />
              <span>Forex</span>
              <Badge variant="secondary" className="ml-1 text-xs font-mono">
                {stats.forex}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* Indian Market Tab */}
          <TabsContent value="indian" className="mt-6">
            {indianMarketAssets.length > 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-border/50">
                          <TableHead className="font-semibold">Symbol</TableHead>
                          <TableHead className="font-semibold">Name</TableHead>
                          <TableHead className="font-semibold">Type</TableHead>
                          <TableHead className="font-semibold">Exchange</TableHead>
                          <TableHead className="font-semibold">Status</TableHead>
                          <TableHead className="text-right font-semibold">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {indianMarketAssets.map((asset) => (
                          <TableRow key={asset.id} data-testid={`asset-row-${asset.id}`} className="border-b border-border/30 hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono font-bold text-lg text-primary">
                              {asset.symbol}
                            </TableCell>
                            <TableCell className="font-semibold text-foreground">{asset.name}</TableCell>
                            <TableCell>
                              <Badge className="text-xs font-semibold bg-chart-2 text-white">
                                {asset.type === "indian_stock" ? "Stock" : "Futures"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm font-medium">
                              {asset.exchange || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={asset.enabled ? "default" : "secondary"} className="text-xs font-semibold">
                                {asset.enabled ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this asset?")) {
                                    deleteMutation.mutate(asset.id);
                                  }
                                }}
                                data-testid={`button-delete-asset-${asset.id}`}
                                className="h-8 w-8 p-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="pt-12 pb-12">
                  <div className="text-center">
                    <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <h3 className="text-base font-medium mb-1">No Indian Market assets</h3>
                    <p className="text-sm text-muted-foreground">
                      Search your results or add new stocks and futures
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Forex Tab */}
          <TabsContent value="forex" className="mt-6">
            {forexAssets.length > 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-border/50">
                          <TableHead className="font-semibold">Symbol</TableHead>
                          <TableHead className="font-semibold">Name</TableHead>
                          <TableHead className="font-semibold">Type</TableHead>
                          <TableHead className="font-semibold">Exchange</TableHead>
                          <TableHead className="font-semibold">Status</TableHead>
                          <TableHead className="text-right font-semibold">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {forexAssets.map((asset) => (
                          <TableRow key={asset.id} data-testid={`asset-row-${asset.id}`} className="border-b border-border/30 hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono font-bold text-lg text-primary">
                              {asset.symbol}
                            </TableCell>
                            <TableCell className="font-semibold text-foreground">{asset.name}</TableCell>
                            <TableCell>
                              <Badge className="text-xs font-semibold bg-chart-3 text-white">
                                Forex
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm font-medium">
                              {asset.exchange || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={asset.enabled ? "default" : "secondary"} className="text-xs font-semibold">
                                {asset.enabled ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this asset?")) {
                                    deleteMutation.mutate(asset.id);
                                  }
                                }}
                                data-testid={`button-delete-asset-${asset.id}`}
                                className="h-8 w-8 p-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="pt-12 pb-12">
                  <div className="text-center">
                    <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <h3 className="text-base font-medium mb-1">No Forex assets</h3>
                    <p className="text-sm text-muted-foreground">
                      Search your results or add new currency pairs
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Asset</DialogTitle>
            <DialogDescription>
              Search and add a stock, future, or forex pair to track
            </DialogDescription>
          </DialogHeader>

          {/* Search Preset Assets */}
          <div className="space-y-2">
            <Label htmlFor="asset-search">Search Assets</Label>
            <div className="flex gap-2 relative">
              {isSearching ? (
                <Loader2 className="h-4 w-4 text-muted-foreground mt-2.5 animate-spin" />
              ) : (
                <Search className="h-4 w-4 text-muted-foreground mt-2.5" />
              )}
              <Input
                id="asset-search"
                placeholder="Search symbols or names (e.g., RELIANCE, EUR)"
                value={assetSearchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                data-testid="input-asset-search"
              />
            </div>
          </div>

          {/* Preset Assets List */}
          {assetSearchQuery && (
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3 bg-muted/20">
              {searchResults.length > 0 ? (
                searchResults.map((preset) => (
                  <button
                    key={preset.symbol}
                    onClick={() => addPresetAsset(preset)}
                    className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors border border-transparent hover:border-border"
                    data-testid={`button-add-preset-${preset.symbol}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-sm text-primary">{preset.symbol}</div>
                        <div className="text-xs text-muted-foreground truncate">{preset.name}</div>
                      </div>
                      <Badge variant="outline" className="text-xs flex-shrink-0">
                        {preset.type === "indian_stock" ? "Stock" : preset.type === "indian_futures" ? "Futures" : "Forex"}
                      </Badge>
                    </div>
                  </button>
                ))
              ) : assetSearchQuery.length > 0 ? (
                <p className="text-sm text-muted-foreground py-2">No matching assets found</p>
              ) : null}
            </div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or add manually</span>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Symbol</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., RELIANCE, EURUSD"
                        {...field}
                        data-testid="input-symbol"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Reliance Industries, EUR/USD"
                        {...field}
                        data-testid="input-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-type">
                          <SelectValue placeholder="Select asset type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="indian_stock">Indian Stock</SelectItem>
                        <SelectItem value="indian_futures">Indian Futures</SelectItem>
                        <SelectItem value="forex">Forex</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="exchange"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Exchange (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., NSE, NYSE"
                        {...field}
                        data-testid="input-exchange"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setAssetSearchQuery("");
                  }}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-submit-asset"
                >
                  {createMutation.isPending ? "Adding..." : "Add Asset"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
