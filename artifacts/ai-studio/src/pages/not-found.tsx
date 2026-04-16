import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-surface">
      <div className="w-full max-w-md mx-4 ds-panel p-8 rounded-2xl">
        <div className="flex flex-col items-center text-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-red/10 flex items-center justify-center text-red border border-red/20">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-4xl font-display font-bold text-on-surface tracking-widest uppercase">404</h1>
            <p className="text-sm font-mono font-bold text-on-surface-variant uppercase tracking-widest mt-2">Page Not Found</p>
          </div>
          <p className="text-sm font-medium text-on-surface-variant/60 leading-relaxed">
            The requested protocol or workspace does not exist within the current governance scope.
          </p>
          <a href="/" className="btn-primary mt-4">Return to Studio</a>
        </div>
      </div>
    </div>
  );
}
