"use client";
import type { Account } from "@docks/api";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
export function AccountsScatter({ accounts }: { accounts: Account[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Seats</TableHead>
          <TableHead>Monthly revenue</TableHead>
          <TableHead>Retention</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => (
          <TableRow key={account.id}>
            <TableCell>{account.name}</TableCell>
            <TableCell>
              <Badge variant="secondary">{account.segment}</Badge>
            </TableCell>
            <TableCell>{account.seats}</TableCell>
            <TableCell>
              {account.monthlyRevenue.toLocaleString(undefined, {
                style: "currency",
                currency: "USD",
              })}
            </TableCell>
            <TableCell>{Math.round(account.retention * 100)}%</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
