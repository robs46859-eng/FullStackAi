import { LogIn, LogOut, Key, CreditCard, Zap, Shield } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();

  const initials = user
    ? [user.firstName, user.lastName]
        .filter(Boolean)
        .map((n) => n![0])
        .join("")
        .toUpperCase() || user.email?.[0]?.toUpperCase() || "?"
    : "?";

  return (
    <header className="h-12 border-b border-outline-variant bg-surface-container-high/80 backdrop-blur-md flex items-center justify-between px-4 flex-shrink-0 z-50">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-primary-accent" />
        <span className="text-sm font-display font-bold tracking-widest text-on-surface uppercase">AI Studio</span>
      </div>

      <nav className="flex items-center gap-1">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-[10px] h-7 font-mono uppercase tracking-widest text-on-surface-variant hover:text-on-surface">
            Studio
          </Button>
        </Link>
        {isAuthenticated && (
          <>
            <Link href="/keys">
              <Button variant="ghost" size="sm" className="text-[10px] h-7 font-mono uppercase tracking-widest text-on-surface-variant hover:text-on-surface">
                <Key className="w-3 h-3 mr-1" />
                API Keys
              </Button>
            </Link>
            <Link href="/billing">
              <Button variant="ghost" size="sm" className="text-[10px] h-7 font-mono uppercase tracking-widest text-on-surface-variant hover:text-on-surface">
                <CreditCard className="w-3 h-3 mr-1" />
                Billing
              </Button>
            </Link>
            {user?.isAdmin && (
              <Link href="/admin">
                <Button variant="ghost" size="sm" className="text-[10px] h-7 font-mono uppercase tracking-widest text-primary-accent/80 hover:text-primary-accent">
                  <Shield className="w-3 h-3 mr-1" />
                  Admin
                </Button>
              </Link>
            )}
          </>
        )}
      </nav>

      <div className="flex items-center gap-2">
        {isLoading ? (
          <div className="w-7 h-7 rounded-full bg-surface-container-highest animate-pulse" />
        ) : isAuthenticated ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="p-0 h-7 w-7 rounded-full">
                <Avatar className="h-7 w-7 border border-outline-variant">
                  <AvatarImage src={user?.profileImageUrl ?? undefined} />
                  <AvatarFallback className="text-[10px] font-bold bg-primary-accent text-surface">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-surface-container-highest border-outline-variant">
              <DropdownMenuLabel className="text-[10px] font-mono font-normal text-on-surface-variant uppercase tracking-widest">
                {user?.email ?? `${user?.firstName} ${user?.lastName}`.trim()}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-outline-variant" />
              <DropdownMenuItem asChild className="text-[11px] font-mono uppercase tracking-wider focus:bg-primary-accent/10 focus:text-primary-accent cursor-pointer">
                <Link href="/keys">
                  <Key className="w-3.5 h-3.5 mr-2" />
                  API Keys
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="text-[11px] font-mono uppercase tracking-wider focus:bg-primary-accent/10 focus:text-primary-accent cursor-pointer">
                <Link href="/billing">
                  <CreditCard className="w-3.5 h-3.5 mr-2" />
                  Billing
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-outline-variant" />
              <DropdownMenuItem onClick={logout} className="text-[11px] font-mono uppercase tracking-wider text-error focus:text-error focus:bg-error/10 cursor-pointer">
                <LogOut className="w-3.5 h-3.5 mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button size="sm" className="h-7 text-[10px] font-mono uppercase tracking-widest bg-primary-accent text-surface hover:bg-primary-accent/90" onClick={login}>
            <LogIn className="w-3 h-3 mr-1.5" />
            Log in
          </Button>
        )}
      </div>
    </header>
  );
}
