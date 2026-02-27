defmodule LiveBetting.BettingFixtures do
  @moduledoc """
  This module defines test helpers for creating
  entities via the `LiveBetting.Betting` context.
  """

  @doc """
  Generate a bet.
  """
  def bet_fixture(attrs \\ %{}) do
    {:ok, bet} =
      attrs
      |> Enum.into(%{
        amount: "120.5",
        placed_at_second: 42,
        status: "some status",
        team_picked: "some team_picked",
        time_weight: "120.5"
      })
      |> LiveBetting.Betting.create_bet()

    bet
  end

  @doc """
  Generate a payout.
  """
  def payout_fixture(attrs \\ %{}) do
    {:ok, payout} =
      attrs
      |> Enum.into(%{
        gross_payout: "120.5",
        paid_at: ~U[2026-02-26 20:59:00Z],
        status: "some status",
        weight_share_pct: "120.5"
      })
      |> LiveBetting.Betting.create_payout()

    payout
  end

  @doc """
  Generate a settlement.
  """
  def settlement_fixture(attrs \\ %{}) do
    {:ok, settlement} =
      attrs
      |> Enum.into(%{
        distributable_pool: "120.5",
        house_cut: "120.5",
        outcome: "some outcome",
        settled_at: ~U[2026-02-26 21:01:00Z],
        total_pool: "120.5"
      })
      |> LiveBetting.Betting.create_settlement()

    settlement
  end
end
