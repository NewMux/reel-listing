import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LocaleProvider } from "./lib/locale";
import Contact from "./pages/Contact";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Legal from "./pages/Legal";
import NotFound from "./pages/NotFound";
import Pricing from "./pages/Pricing";
import PilotProject from "./pages/PilotProject";
import ProjectDetail from "./pages/ProjectDetail";
import ProjectReview from "./pages/ProjectReview";
import Auth from "./pages/Auth";

function Router() {
  return <Switch><Route path="/" component={Home}/><Route path="/pricing" component={Pricing}/><Route path="/contact" component={Contact}/><Route path="/terms">{() => <Legal type="terms"/>}</Route><Route path="/privacy">{() => <Legal type="privacy"/>}</Route><Route path="/auth" component={Auth}/><Route path="/pilot" component={PilotProject}/><Route path="/dashboard" component={Dashboard}/><Route path="/projects/new" component={PilotProject}/><Route path="/projects/:id/review" component={ProjectReview}/><Route path="/projects/:id" component={ProjectDetail}/><Route component={NotFound}/></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><LocaleProvider><TooltipProvider><Toaster/><Router/></TooltipProvider></LocaleProvider></ThemeProvider></ErrorBoundary>;
}

