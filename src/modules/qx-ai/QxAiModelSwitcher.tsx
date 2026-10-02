import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Check, ChevronDown, Package, Search, Settings2, Star } from "lucide-react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui";
import { useT } from "../../i18n";
import type { ModelCapabilityOverride } from "../settings/store";
import {
  formatContextLength,
  isFavoriteModel,
  resolveModelContextLength,
  resolveModelReasoning,
  resolveModelVision,
  sortModelsForPicker,
} from "./model-capabilities";
import type { G4fProvider, QxAiModelInfo } from "./store";

type ModelGroup = {
  id: string;
  name: string;
  models: QxAiModelInfo[];
};

type ModelChoice = {
  key: string;
  providerId: string;
  model: QxAiModelInfo;
};

function choiceKey(providerId: string, modelId: string): string {
  return `${encodeURIComponent(providerId)}::${encodeURIComponent(modelId)}`;
}

function buildModelGroups(
  providers: G4fProvider[],
  providerId: string,
  modelId: string,
  favorites: string[],
): ModelGroup[] {
  const groups = providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    models: [...provider.models],
  }));
  const currentProvider = groups.find((provider) => provider.id === providerId);

  if (providerId && modelId && currentProvider) {
    if (!currentProvider.models.some((model) => model.id === modelId)) {
      currentProvider.models.unshift({ id: modelId, name: modelId });
    }
  } else if (providerId && modelId) {
    groups.unshift({
      id: providerId,
      name: providerId,
      models: [{ id: modelId, name: modelId }],
    });
  }

  return groups
    .map((provider) => ({
      ...provider,
      models: sortModelsForPicker(provider.id, provider.models, favorites),
    }))
    .filter((provider) => provider.models.length > 0);
}

export function QxAiModelSwitcher({
  providers,
  providerId,
  modelId,
  favorites,
  capabilities,
  disabled = false,
  composerRef,
  onChange,
  onManageModels,
}: {
  providers: G4fProvider[];
  providerId: string;
  modelId: string;
  favorites: string[];
  capabilities: Record<string, ModelCapabilityOverride>;
  disabled?: boolean;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (providerId: string, modelId: string) => void;
  onManageModels: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const restoreComposerRef = useRef(false);
  const listId = `qx-ai-model-options-${useId()}`;
  const groups = useMemo(
    () => buildModelGroups(providers, providerId, modelId, favorites),
    [favorites, modelId, providerId, providers],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return groups;
    return groups
      .map((group) => ({
        ...group,
        models: group.models.filter((model) =>
          `${group.name} ${group.id} ${model.name} ${model.id}`
            .toLocaleLowerCase()
            .includes(normalizedQuery),
        ),
      }))
      .filter((group) => group.models.length > 0);
  }, [groups, normalizedQuery]);
  const choices = useMemo<ModelChoice[]>(
    () => visibleGroups.flatMap((group) =>
      group.models.map((model) => ({
        key: choiceKey(group.id, model.id),
        providerId: group.id,
        model,
      })),
    ),
    [visibleGroups],
  );
  const totalModels = groups.reduce((total, group) => total + group.models.length, 0);
  const showSearch = totalModels >= 8;
  const selectedKey = choiceKey(providerId, modelId);
  const selectedChoice = groups
    .flatMap((group) => group.models.map((model) => ({ group, model })))
    .find(({ group, model }) => choiceKey(group.id, model.id) === selectedKey);
  const providerName = selectedChoice?.group.name || providerId;
  const modelName = selectedChoice?.model.name || modelId || t("qxai.modelPicker.select", "Select model");
  const fullLabel = providerName ? `${providerName} · ${modelName}` : modelName;
  const triggerHint = disabled
    ? t("qxai.modelPicker.locked", "Model is locked while a response is running")
    : fullLabel;

  const focusChoice = (index: number) => {
    if (choices.length === 0) return;
    const normalized = (index + choices.length) % choices.length;
    optionRefs.current.get(choices[normalized].key)?.focus();
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || choices.length === 0) return;
    const targetIsSearch = event.target === searchRef.current;
    const focusedIndex = choices.findIndex(
      (choice) => optionRefs.current.get(choice.key) === document.activeElement,
    );
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const selectedIndex = Math.max(0, choices.findIndex((choice) => choice.key === selectedKey));
      if (targetIsSearch || focusedIndex < 0) {
        focusChoice(event.key === "ArrowDown" ? selectedIndex : choices.length - 1);
      } else {
        focusChoice(focusedIndex + (event.key === "ArrowDown" ? 1 : -1));
      }
    } else if (!targetIsSearch && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      focusChoice(event.key === "Home" ? 0 : choices.length - 1);
    }
  };

  const selectModel = (choice: ModelChoice) => {
    restoreComposerRef.current = true;
    onChange(choice.providerId, choice.model.id);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (disabled && nextOpen) return;
        restoreComposerRef.current = false;
        setOpen(nextOpen);
        if (nextOpen) setQuery("");
      }}
      modal={false}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="qx-ai-model-trigger"
          disabled={disabled}
          title={triggerHint}
          aria-label={t("qxai.modelPicker.switch", "Switch model") + `: ${triggerHint}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          data-qx-ai="model-switcher"
          data-model-provider={providerId}
          data-model-id={modelId}
        >
          <Package size={14} aria-hidden="true" />
          {providerName ? (
            <span className="qx-ai-model-trigger-provider" aria-hidden="true">
              {providerName}
            </span>
          ) : null}
          <span className="qx-ai-model-trigger-name">{modelName}</span>
          <ChevronDown size={13} className="qx-ai-model-trigger-chevron" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={10}
        className="qx-ai-model-popover"
        onKeyDown={handleKeyboard}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => {
            if (showSearch) searchRef.current?.focus();
            else focusChoice(Math.max(0, choices.findIndex((choice) => choice.key === selectedKey)));
          });
        }}
        onCloseAutoFocus={(event) => {
          if (!restoreComposerRef.current) return;
          event.preventDefault();
          requestAnimationFrame(() => composerRef.current?.focus());
        }}
      >
        {showSearch ? (
          <div className="qx-ai-model-search">
            <Search size={14} aria-hidden="true" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("qxai.modelPicker.search", "Search models…")}
              aria-label={t("qxai.modelPicker.search", "Search models…")}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
            />
          </div>
        ) : null}
        <div id={listId} className="qx-ai-model-list" role="listbox">
          {visibleGroups.map((group) => (
            <section
              className="qx-ai-model-group"
              key={group.id}
              role="group"
              aria-label={group.name}
            >
              <div className="qx-ai-model-group-label" aria-hidden="true">{group.name}</div>
              {group.models.map((model) => {
                const key = choiceKey(group.id, model.id);
                const selected = key === selectedKey;
                const favorite = isFavoriteModel(group.id, model.id, favorites);
                const context = formatContextLength(
                  resolveModelContextLength(group.id, model, capabilities),
                );
                return (
                  <Button
                    key={key}
                    ref={(node) => {
                      if (node) optionRefs.current.set(key, node);
                      else optionRefs.current.delete(key);
                    }}
                    type="button"
                    variant="ghost"
                    className="qx-ai-model-option"
                    role="option"
                    aria-selected={selected}
                    data-model-option={key}
                    onClick={() => selectModel({
                      key,
                      providerId: group.id,
                      model,
                    })}
                  >
                    <span className="qx-ai-model-option-main">
                      <span className="qx-ai-model-option-name" title={model.name || model.id}>
                        {model.name || model.id}
                      </span>
                      <span className="qx-ai-model-option-badges">
                        {favorite ? (
                          <span
                            className="qx-ai-model-badge is-favorite"
                            title={t("qxai.modelPicker.favorite", "Favorite")}
                          >
                            <Star size={10} fill="currentColor" aria-hidden="true" />
                          </span>
                        ) : null}
                        {resolveModelVision(group.id, model, capabilities) ? (
                          <span className="qx-ai-model-badge">
                            {t("agent.model.vision.badge", "Vision")}
                          </span>
                        ) : null}
                        {resolveModelReasoning(group.id, model, capabilities) ? (
                          <span className="qx-ai-model-badge">
                            {t("agent.model.reasoning.badge", "Reasoning")}
                          </span>
                        ) : null}
                        {context ? <span className="qx-ai-model-badge">{context}</span> : null}
                      </span>
                    </span>
                    <Check
                      size={14}
                      className="qx-ai-model-option-check"
                      aria-hidden="true"
                    />
                  </Button>
                );
              })}
            </section>
          ))}
          {choices.length === 0 ? (
            <div className="qx-ai-model-empty">
              {normalizedQuery
                ? t("qxai.modelPicker.empty", "No matching models")
                : t("qxai.noModels", "No models available for this provider")}
            </div>
          ) : null}
        </div>
        <div className="qx-ai-model-footer">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              restoreComposerRef.current = false;
              setOpen(false);
              requestAnimationFrame(onManageModels);
            }}
          >
            <Settings2 size={13} aria-hidden="true" />
            {t("qxai.modelPicker.manage", "Manage models")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
