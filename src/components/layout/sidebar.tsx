"use client";

import React from "react";
import {
  Atom,
  Beaker,
  FileText,
  FlaskConical,
  History,
  Layers2,
  Microscope,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
  showSnowpolyMenu?: boolean;
}

export function Sidebar({
  isOpen,
  onClose,
  activeView,
  onViewChange,
  showSnowpolyMenu = false,
}: SidebarProps) {
  const menuItems = [
    {
      id: "explorer",
      label: "File Explorer",
      icon: FileText,
    },
    {
      id: "inspect",
      label: "Inspect",
      icon: Microscope,
    },
    ...(showSnowpolyMenu
      ? [
          {
            id: "inspect-v2" as const,
            label: "SnowPoly Inspect - V0",
            icon: Layers2,
          },
          {
            id: "snowpoly-inspect-v1" as const,
            label: "SnowPoly Inspect - V1",
            icon: Beaker,
          },
          {
            id: "snowpoly-inspect-v2" as const,
            label: "SnowPoly Inspect - V2",
            icon: FlaskConical,
          },
          {
            id: "snowpoly-inspect-v3" as const,
            label: "SnowPoly Inspect - V3",
            icon: Atom,
          },
          {
            id: "snowpoly-prices" as const,
            label: "Snowpoly prices",
            icon: History,
          },
        ]
      : []),
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
    },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed left-0 top-16 z-30 h-[calc(100vh-64px)] w-64 border-r border-border bg-background transition-transform duration-300 md:static md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <nav className="flex flex-col gap-1 p-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant={activeView === item.id ? "default" : "ghost"}
                className="w-full justify-start gap-2"
                onClick={() => {
                  onViewChange(item.id);
                  onClose();
                }}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
