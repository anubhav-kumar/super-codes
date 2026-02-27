defmodule LiveBetting.Repo.Migrations.CreateUsers do
  use Ecto.Migration

  def change do
    create table(:users) do
      add :name, :string
      add :phone, :string
      add :wallet_balance, :decimal

      timestamps(type: :utc_datetime)
    end
  end
end
