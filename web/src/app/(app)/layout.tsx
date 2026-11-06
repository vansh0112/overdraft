import { Footer, Nav } from "@/components/brand";
import { WalletButton } from "@/components/dashboard/WalletButton";

/** App pages: the console look, with the wallet button in the header. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas text-fg">
      <Nav cta={false}>
        <WalletButton />
      </Nav>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
