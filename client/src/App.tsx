import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LocaleProvider } from "./lib/locale";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Legal from "./pages/Legal";
import NewProject from "./pages/NewProject";
import NotFound from "./pages/NotFound";
import Pricing from "./pages/Pricing";
import ProjectDetail from "./pages/ProjectDetail";
import ProjectReview from "./pages/ProjectReview";
import Pilot from "./pages/Pilot";

function Router() {
  return <Switch><Route path="/" component={Home}/><Route path="/pricing" component={Pricing}/><Route path="/terms">{() => <Legal type="terms"/>}</Route><Route path="/privacy">{() => <Legal type="privacy"/>}</Route><Route path="/pilot" component={Pilot}/><Route path="/dashboard" component={Dashboard}/><Route path="/projects/new" component={NewProject}/><Route path="/projects/:id/review" component={ProjectReview}/><Route path="/projects/:id" component={ProjectDetail}/><Route component={NotFound}/></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><LocaleProvider><TooltipProvider><Toaster/><Router/></TooltipProvider></LocaleProvider></ThemeProvider></ErrorBoundary>;
}

