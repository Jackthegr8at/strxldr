import { ThemeToggle } from './ThemeToggle';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from '@radix-ui/react-dropdown-menu';
import { ChevronDownIcon, ShareIcon } from '@heroicons/react/24/outline';
import { useState, useContext, type MouseEvent } from 'react';
import { NavigationContext } from '../contexts/UserSelectContext';

export function Header() {
  const navigation = useContext(NavigationContext);
  const isBridge = window.location.pathname === '/bridge';
  const isLeaderboard = !isBridge && !new URLSearchParams(window.location.search).has('user');
  const [showShareToast, setShowShareToast] = useState(false);
  const navigate = (event: MouseEvent<HTMLAnchorElement>, destination: 'home' | 'bridge') => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigation[destination]();
  };
  const handleShare = async () => {
    const currentUrl = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: 'STRX Leaderboard', url: currentUrl }); } catch { /* user cancelled share */ }
    } else {
      try {
        await navigator.clipboard.writeText(currentUrl);
        setShowShareToast(true);
        setTimeout(() => setShowShareToast(false), 2000);
      } catch (err) { console.error('Failed to copy:', err); }
    }
  };
  return <>
    <header className="app-header">
      <div className="header-inner">
        <div className="header-navigation">
          <a className="brand-link" href="/" onClick={event => navigate(event, 'home')}>
            <img src="/favicon-128.webp" width={32} height={32} alt="STRX Logo" />
            <span>STRX<span className="brand-description"> Staking</span></span>
          </a>
          <nav className="primary-navigation" aria-label="Primary navigation">
            <a href="/" aria-current={isLeaderboard ? 'page' : undefined} onClick={event => navigate(event, 'home')}>Leaderboard</a>
            <a href="/bridge" aria-current={isBridge ? 'page' : undefined} onClick={event => navigate(event, 'bridge')}>Bridge</a>
          </nav>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild><button className="header-more" aria-label="More STRX links"><span>More</span><ChevronDownIcon className="h-4 w-4" /></button></DropdownMenuTrigger>
            <DropdownMenuContent className="header-menu" sideOffset={8}>
              {[
                ['NFT Minting System', 'https://mint.strxldr.app/'],
                ['NFT Escrow System', 'https://mint.strxldr.app/escrow'],
                ['STRX Website', 'https://storex.io'],
              ].map(([label, href]) => <DropdownMenuItem key={href} asChild><a href={href}>{label}</a></DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <button onClick={handleShare} className="icon-control share-control" aria-label="Share page"><ShareIcon className="h-5 w-5" /><span>Share</span></button>
        </div>
      </div>
    </header>
    {showShareToast && <div className="share-toast" role="status">Link copied to clipboard!</div>}
  </>;
}
