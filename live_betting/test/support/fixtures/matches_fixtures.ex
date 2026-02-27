defmodule LiveBetting.MatchesFixtures do
  @moduledoc """
  This module defines test helpers for creating
  entities via the `LiveBetting.Matches` context.
  """

  @doc """
  Generate a match.
  """
  def match_fixture(attrs \\ %{}) do
    {:ok, match} =
      attrs
      |> Enum.into(%{
        ends_at: ~U[2026-02-26 20:58:00Z],
        sport: "some sport",
        starts_at: ~U[2026-02-26 20:58:00Z],
        status: "some status",
        team_a_name: "some team_a_name",
        team_b_name: "some team_b_name",
        winning_team: "some winning_team"
      })
      |> LiveBetting.Matches.create_match()

    match
  end

  @doc """
  Generate a pool.
  """
  def pool_fixture(attrs \\ %{}) do
    {:ok, pool} =
      attrs
      |> Enum.into(%{
        team: "some team",
        total_amount: "120.5",
        total_weight: "120.5"
      })
      |> LiveBetting.Matches.create_pool()

    pool
  end

  @doc """
  Generate a window.
  """
  def window_fixture(attrs \\ %{}) do
    {:ok, window} =
      attrs
      |> Enum.into(%{
        closes_at: ~U[2026-02-26 20:59:00Z],
        duration_seconds: 42,
        house_takeout_pct: "120.5",
        opens_at: ~U[2026-02-26 20:59:00Z],
        resolution_type: "some resolution_type",
        sequence_number: 42,
        status: "some status",
        winning_team: "some winning_team"
      })
      |> LiveBetting.Matches.create_window()

    window
  end

  @doc """
  Generate a window.
  """
  def window_fixture(attrs \\ %{}) do
    {:ok, window} =
      attrs
      |> Enum.into(%{
        closes_at: ~U[2026-02-26 21:04:00Z],
        duration_seconds: 42,
        house_takeout_pct: "120.5",
        opens_at: ~U[2026-02-26 21:04:00Z],
        resolution_type: "some resolution_type",
        sequence_number: 42,
        status: "some status",
        winning_team: "some winning_team"
      })
      |> LiveBetting.Matches.create_window()

    window
  end
end
