"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { PasswordStrength, passwordMeetsPolicy } from "../../components/PasswordStrength";
import { api } from "../../../lib/api";
import { clearSession } from "../../../components/auth";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { inputClass } from "./shared";

interface ChangePasswordCardProps {
  userId: string;
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

export function ChangePasswordCard({ userId, toastSuccess, toastError }: ChangePasswordCardProps) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toastError("Passwords don't match");
      return;
    }
    if (newPassword.length < 12) {
      toastError("Password must be at least 12 characters");
      return;
    }
    try {
      await api("/v1/auth/change-password", userId, {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toastSuccess("Password changed. Logging you out…");
      setTimeout(() => {
        void clearSession().then(() => router.push("/login"));
      }, 2000);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to change password");
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-accent/10">
          <Shield className="w-5 h-5 text-accent" />
        </div>
        <h2 className="text-xl font-bold text-text-primary">Change Password</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Current Password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
            placeholder="Enter current password"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            New Password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
            placeholder="Enter new password"
            autoComplete="new-password"
          />
          <PasswordStrength password={newPassword} />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Confirm New Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
            placeholder="Confirm new password"
            autoComplete="new-password"
          />
          {confirmPassword && confirmPassword !== newPassword && (
            <p className="mt-1 text-xs text-danger">Passwords don&apos;t match</p>
          )}
        </div>

        <Button
          onClick={handleChangePassword}
          size="lg"
          className="w-full"
          disabled={!passwordMeetsPolicy(newPassword) || newPassword !== confirmPassword}
        >
          Change Password
        </Button>
      </div>
    </Card>
  );
}
