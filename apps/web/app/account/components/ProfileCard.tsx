"use client";

import { useState } from "react";
import { Save, User } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { inputClass, type Me } from "./shared";

interface ProfileCardProps {
  me: Me;
  userId: string;
  initialEmail: string;
  initialDisplayName: string;
  initialTimezone: string;
  onEmailChange: (email: string) => void;
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

export function ProfileCard({
  me,
  userId,
  initialEmail,
  initialDisplayName,
  initialTimezone,
  onEmailChange,
  toastSuccess,
  toastError,
}: ProfileCardProps) {
  const [email, setEmail] = useState(initialEmail);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [timezone, setTimezone] = useState(initialTimezone);

  const handleUpdateProfile = async () => {
    try {
      await api("/v1/auth/profile", userId, {
        method: "PATCH",
        body: JSON.stringify({ email, displayName: displayName || undefined, timezone }),
      });
      toastSuccess("Profile updated successfully");
      onEmailChange(email);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to update profile");
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-accent/10">
          <User className="w-5 h-5 text-accent" />
        </div>
        <h2 className="text-xl font-bold text-text-primary">Profile</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Display name <span className="text-text-secondary font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputClass}
            placeholder="Jane Smith"
            maxLength={64}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="your@email.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={inputClass}
          >
            {[
              "UTC", "Europe/Berlin", "Europe/London", "Europe/Paris", "Europe/Vienna",
              "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
              "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore", "Australia/Sydney",
              "Pacific/Auckland",
            ].map((tz) => (
              <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 py-1">
          <span className="text-sm text-text-secondary">Role:</span>
          <Badge variant={me?.role === "admin" ? "success" : "default"}>
            {me?.role || "user"}
          </Badge>
        </div>

        <Button onClick={handleUpdateProfile} size="lg" className="w-full">
          Save Profile
        </Button>
      </div>
    </Card>
  );
}
