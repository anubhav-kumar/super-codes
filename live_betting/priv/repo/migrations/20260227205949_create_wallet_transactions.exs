defmodule LiveBetting.Repo.Migrations.CreateWalletTransactions do
  use Ecto.Migration

  def change do
    create table(:wallet_transactions) do
      add :type, :string
      add :amount, :decimal
      add :balance_after, :decimal
      add :user_id, references(:users, on_delete: :nothing)
      add :bet_id, references(:bets, on_delete: :nothing)
      add :payout_id, references(:payouts, on_delete: :nothing)

      timestamps(type: :utc_datetime)
    end

    create index(:wallet_transactions, [:user_id])
    create index(:wallet_transactions, [:bet_id])
    create index(:wallet_transactions, [:payout_id])
  end
end
