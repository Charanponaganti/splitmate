import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check, RefreshCw, Scale, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-4" />
          </span>
          {APP_NAME}
        </span>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5">
        <section className="grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <RefreshCw className="size-3" /> Live updates across every phone in the group
            </p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Shared expenses,
              <br />
              <span className="text-primary">settled without the maths.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Add what you paid, pick who shared it, and {APP_NAME} works out exactly who owes whom — down to the last
              paisa — with the fewest payments to settle up.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup">
                  Create a free account <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">I already have one</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <p className="text-sm text-muted-foreground">Goa trip · 4 friends</p>
                <p className="text-lg font-semibold">Dinner at the shack</p>
              </div>
              <p className="tabular text-xl font-semibold">₹1,200.00</p>
            </div>
            <ul className="divide-y text-sm">
              {[
                ["Asha paid", "₹1,200.00", "text-foreground"],
                ["Asha's share", "₹400.00", "text-muted-foreground"],
                ["Bilal owes Asha", "₹400.00", "text-negative"],
                ["Chen owes Asha", "₹400.00", "text-negative"],
                ["Divya wasn't there", "₹0.00", "text-muted-foreground"],
              ].map(([label, amount, tone]) => (
                <li key={label} className="flex items-center justify-between py-3">
                  <span>{label}</span>
                  <span className={`tabular font-medium ${tone}`}>{amount}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-3">
          {[
            { icon: Users, title: "Groups for anything", body: "Trips, flatmates, dinners, events — invite friends with a link." },
            { icon: Scale, title: "Every kind of split", body: "Equal, exact amounts, percentages or shares, with multiple payers." },
            { icon: Check, title: "Settle in fewer payments", body: "We simplify debts so the group settles with the minimum transfers." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border bg-card p-5">
              <Icon className="size-5 text-primary" />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
