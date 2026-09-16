/**
 * PresetManager
 * 
 * Component for managing user presets
 * Supports creating, editing, deleting, duplicating, importing, and exporting presets
 */

import React, { useState, useCallback } from "react";
import { cn } from "../../lib/utils";
import { useCustomization } from "../../context/CustomizationContext";
import type { UserPreset } from "../../types/customization";
import { 
  Plus, 
  Copy, 
  Trash2, 
  Download, 
  Upload, 
  Edit2,
  Check,
  X,
  Star,
  Clock
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "../ui/Shandc/toast";

interface PresetManagerProps {
  className?: string;
}

export function PresetManager({ className }: PresetManagerProps) {
  const { 
    currentPreset, 
    createPreset, 
    updatePreset, 
    deletePreset, 
    duplicatePreset, 
    exportPreset, 
    importPreset,
    setCurrentPreset 
  } = useCustomization();
  
  const showToast = (title: string, description: string, variant: "default" | "destructive" = "default") => {
    console.log(`[${variant.toUpperCase()}] ${title}: ${description}`);
    // Simple alert fallback for now - can be replaced with proper toast later
    // alert(`${title}: ${description}`);
  };
  
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<string | null>(null);
  const [editingPreset, setEditingPreset] = useState<{ id: string; name: string; description?: string } | null>(null);
  
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetDescription, setNewPresetDescription] = useState("");

  // Load user presets from localStorage
  const userPresets = React.useMemo(() => {
    try {
      const saved = localStorage.getItem("pherielium_user_presets");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, []);

  const allPresets = React.useMemo(() => {
    return [...userPresets, currentPreset].filter(Boolean);
  }, [userPresets, currentPreset]);

  const handleCreatePreset = useCallback(() => {
    if (!newPresetName.trim()) {
      showToast("Nome obrigatório", "Por favor, forneça um nome para o preset.", "destructive");
      return;
    }

    try {
      const newPreset = createPreset(newPresetName, newPresetDescription);
      setCurrentPreset(newPreset);
      setShowCreateForm(false);
      setNewPresetName("");
      setNewPresetDescription("");
      
      showToast("Preset criado", `"${newPresetName}" foi salvo com sucesso.`);
    } catch {
      showToast("Erro ao criar preset", "Não foi possível criar o preset. Tente novamente.", "destructive");
    }
  }, [newPresetName, newPresetDescription, createPreset, setCurrentPreset]);

  const handleEditPreset = useCallback(() => {
    if (!editingPreset || !editingPreset.name.trim()) {
      showToast("Nome obrigatório", "Por favor, forneça um nome para o preset.", "destructive");
      return;
    }

    try {
      updatePreset(editingPreset.id, {
        name: editingPreset.name,
        description: editingPreset.description,
      });
      setShowEditForm(false);
      setEditingPreset(null);
      
      showToast("Preset atualizado", `"${editingPreset.name}" foi atualizado com sucesso.`);
    } catch {
      showToast("Erro ao atualizar preset", "Não foi possível atualizar o preset. Tente novamente.", "destructive");
    }
  }, [editingPreset, updatePreset]);

  const handleDeletePreset = useCallback(() => {
    if (!presetToDelete) return;

    try {
      deletePreset(presetToDelete);
      setPresetToDelete(null);
      
      showToast("Preset excluído", "O preset foi removido com sucesso.");
    } catch {
      showToast("Erro ao excluir preset", "Não foi possível excluir o preset. Tente novamente.", "destructive");
    }
  }, [presetToDelete, deletePreset]);

  const handleDuplicatePreset = useCallback((presetId: string, presetName: string) => {
    try {
      duplicatePreset(presetId, `${presetName} (cópia)`);
      showToast("Preset duplicado", `"${presetName}" foi duplicado com sucesso.`);
    } catch {
      showToast("Erro ao duplicar preset", "Não foi possível duplicar o preset. Tente novamente.", "destructive");
    }
  }, [duplicatePreset]);

  const handleExportPreset = useCallback((presetId: string, presetName: string) => {
    try {
      const json = exportPreset(presetId);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${presetName.replace(/\s+/g, "_").toLowerCase()}_preset.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast("Preset exportado", `"${presetName}" foi baixado com sucesso.`);
    } catch {
      showToast("Erro ao exportar preset", "Não foi possível exportar o preset. Tente novamente.", "destructive");
    }
  }, [exportPreset]);

  const handleImportPreset = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const imported = importPreset(json);
        
        if (imported) {
          showToast("Preset importado", `"${imported.name}" foi importado com sucesso.`);
        } else {
          showToast("Erro ao importar", "O arquivo não contém um preset válido.", "destructive");
        }
      } catch {
        showToast("Erro ao importar preset", "Não foi possível ler o arquivo. Tente novamente.", "destructive");
      }
    };
    reader.readAsText(file);
    
    // Reset input
    event.target.value = "";
  }, [importPreset, toast]);

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Meus Presets</h3>
        <div className="flex items-center gap-2">
          {/* Import */}
          <div className="relative">
            <input
              type="file"
              accept=".json"
              onChange={handleImportPreset}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Button variant="outline" size="sm" className="gap-2">
              <Upload className="w-4 h-4" />
              Importar
            </Button>
          </div>

          {/* Create New */}
          {showCreateForm ? (
            <div className="flex items-center gap-2">
              <Input
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Nome do preset"
                className="w-48"
              />
              <Button size="sm" onClick={handleCreatePreset}>
                <Check className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                setShowCreateForm(false);
                setNewPresetName("");
                setNewPresetDescription("");
              }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button size="sm" className="gap-2" onClick={() => setShowCreateForm(true)}>
              <Plus className="w-4 h-4" />
              Novo Preset
            </Button>
          )}
        </div>
      </div>

      {/* Presets Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {allPresets.map((preset: UserPreset) => {
          const isActive = currentPreset?.id === preset.id;
          const isDefault = preset.isDefault;
          
          return (
            <div
              key={preset.id}
              className={cn(
                "relative p-4 rounded-xl border-2 transition-all duration-200",
                "hover:border-white/20 hover:bg-white/5",
                isActive
                  ? "border-white/40 bg-white/10 shadow-lg"
                  : "border-white/10 bg-white/[0.02]"
              )}
            >
              {/* Active Indicator */}
              {isActive && (
                <div className="absolute top-3 right-3">
                  <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
                    <Check className="w-3 h-3 text-black" />
                  </div>
                </div>
              )}

              {/* Default Badge */}
              {isDefault && (
                <div className="absolute top-3 left-3">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20">
                    <Star className="w-3 h-3 text-white/80" />
                    <span className="text-[10px] font-medium text-white/80">Padrão</span>
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="pt-6 space-y-3">
                <div>
                  <h4 className="font-semibold text-white/90 mb-1">{preset.name}</h4>
                  {preset.description && (
                    <p className="text-xs text-white/50 line-clamp-2">{preset.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-white/40">
                  <Clock className="w-3 h-3" />
                  <span>Atualizado em {formatDate(preset.updatedAt)}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                  {!isDefault && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-white/60 hover:text-white"
                        onClick={() => {
                          setEditingPreset({
                            id: preset.id,
                            name: preset.name,
                            description: preset.description,
                          });
                          setShowEditForm(true);
                        }}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-white/60 hover:text-white"
                        onClick={() => handleDuplicatePreset(preset.id, preset.name)}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-white/60 hover:text-white"
                        onClick={() => handleExportPreset(preset.id, preset.name)}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-white/60 hover:text-rose-400"
                        onClick={() => {
                          if (confirm(`Tem certeza que deseja excluir "${preset.name}"?`)) {
                            handleDeletePreset();
                            setPresetToDelete(preset.id);
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-white/60 hover:text-white ml-auto"
                    onClick={() => setCurrentPreset(preset)}
                  >
                    Aplicar
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Inline Edit Form */}
      {showEditForm && editingPreset && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#08090C] border border-white/10 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Editar Preset</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/80">Nome</label>
                <Input
                  value={editingPreset.name}
                  onChange={(e) => setEditingPreset(prev => prev ? { ...prev, name: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/80">Descrição (opcional)</label>
                <Input
                  value={editingPreset.description || ""}
                  onChange={(e) => setEditingPreset(prev => prev ? { ...prev, description: e.target.value } : null)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEditForm(false);
                    setEditingPreset(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button onClick={handleEditPreset}>Salvar</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
