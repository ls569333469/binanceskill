CREATE TABLE `alpha_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`chain_id` text NOT NULL,
	`contract_address` text,
	`first_seen_at` text DEFAULT (datetime('now')),
	`is_new` integer DEFAULT 1,
	`matched` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_alpha_chain` ON `alpha_tokens` (`chain_id`,`contract_address`);--> statement-breakpoint
CREATE TABLE `collector_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT 1,
	`cron_expr` text DEFAULT '0 * * * *',
	`params_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collector_config_name_unique` ON `collector_config` (`name`);--> statement-breakpoint
CREATE TABLE `match_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alpha_token_id` integer,
	`token_id` integer,
	`symbol` text NOT NULL,
	`chain_id` text NOT NULL,
	`contract_address` text,
	`score` real DEFAULT 0,
	`reasons` text,
	`market_cap` real,
	`volume` real,
	`smart_money_count` integer,
	`risk_level` text,
	`status` text DEFAULT 'new',
	`matched_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`alpha_token_id`) REFERENCES `alpha_tokens`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`token_id`) REFERENCES `tokens`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_match` ON `match_results` (`chain_id`,`contract_address`);--> statement-breakpoint
CREATE TABLE `signal_strategy_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT 1,
	`entry_mode` text NOT NULL,
	`entry_volume_5m_min` real DEFAULT 100000,
	`entry_sm_count_min` integer DEFAULT 3,
	`weight_sm` real DEFAULT 30,
	`weight_social` real DEFAULT 20,
	`weight_trend` real DEFAULT 25,
	`weight_inflow` real DEFAULT 25,
	`buy_threshold` real DEFAULT 70,
	`watch_expire_minutes` integer DEFAULT 60,
	`params_json` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signal_strategy_config_name_unique` ON `signal_strategy_config` (`name`);--> statement-breakpoint
CREATE TABLE `smart_money_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`signal_id` text,
	`chain_id` text,
	`ticker` text,
	`contract_address` text,
	`direction` text,
	`alert_price` real,
	`max_gain` real,
	`smart_money_count` integer,
	`exit_rate` integer,
	`status` text,
	`captured_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_signal` ON `smart_money_signals` (`chain_id`,`contract_address`,`direction`,`signal_id`);--> statement-breakpoint
CREATE TABLE `token_audits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chain_id` text,
	`contract_address` text,
	`risk_level` text,
	`buy_tax` real,
	`sell_tax` real,
	`risk_items_json` text,
	`audited_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_audit` ON `token_audits` (`chain_id`,`contract_address`);--> statement-breakpoint
CREATE TABLE `token_klines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chain_id` text NOT NULL,
	`contract_address` text NOT NULL,
	`interval` text NOT NULL,
	`timestamp` integer NOT NULL,
	`open` real,
	`high` real,
	`low` real,
	`close` real,
	`volume` real,
	`count` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_kline` ON `token_klines` (`chain_id`,`contract_address`,`interval`,`timestamp`);--> statement-breakpoint
CREATE TABLE `token_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_id` integer,
	`source` text NOT NULL,
	`captured_at` text DEFAULT (datetime('now')),
	`period` text,
	`price` real,
	`market_cap` real,
	`liquidity` real,
	`volume` real,
	`holders` integer,
	`kyc_holders` integer,
	`percent_change` real,
	`top10_holders_pct` real,
	`extra_json` text,
	FOREIGN KEY (`token_id`) REFERENCES `tokens`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_snapshots_token` ON `token_snapshots` (`token_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `token_watchlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_id` integer,
	`chain_id` text NOT NULL,
	`contract_address` text NOT NULL,
	`symbol` text NOT NULL,
	`entry_mode` text NOT NULL,
	`entry_reason` text NOT NULL,
	`entry_volume` real,
	`entry_price` real,
	`entered_at` text DEFAULT (datetime('now')),
	`sm_score` real DEFAULT 0,
	`social_score` real DEFAULT 0,
	`trend_score` real DEFAULT 0,
	`inflow_score` real DEFAULT 0,
	`total_score` real DEFAULT 0,
	`negative_score` real DEFAULT 0,
	`score_updated_at` text,
	`status` text DEFAULT 'watching',
	`expires_at` text,
	`signal_details_json` text,
	FOREIGN KEY (`token_id`) REFERENCES `tokens`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_watchlist` ON `token_watchlist` (`chain_id`,`contract_address`);--> statement-breakpoint
CREATE INDEX `idx_watchlist_status` ON `token_watchlist` (`status`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`chain_id` text NOT NULL,
	`contract_address` text,
	`name` text,
	`launch_time` integer,
	`first_seen_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_chain_contract` ON `tokens` (`chain_id`,`contract_address`);--> statement-breakpoint
CREATE TABLE `topic_rushes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_id` text NOT NULL,
	`chain_id` text NOT NULL,
	`name` text,
	`type` text,
	`ai_summary` text,
	`net_inflow` real,
	`net_inflow_1h` real,
	`net_inflow_ath` real,
	`token_size` integer,
	`progress` text,
	`tokens_json` text,
	`captured_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_topic` ON `topic_rushes` (`topic_id`,`chain_id`);