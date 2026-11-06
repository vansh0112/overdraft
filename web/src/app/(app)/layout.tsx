import { Footer, Nav } from "@/components/brand";
import { WalletButton } from "@/components/dashboard/WalletButton";

/** Dashboard pages: dark surface, with the wallet button in the header. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-ink text-paper">
      <Nav surface="ink">
        <WalletButton />
      </Nav>
      <main className="flex-1">{children}</main>
      <Footer surface="ink" />
    </div>
  );
}
