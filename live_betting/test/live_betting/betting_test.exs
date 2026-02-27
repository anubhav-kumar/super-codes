defmodule LiveBetting.BettingTest do
  use LiveBetting.DataCase

  alias LiveBetting.Betting

  describe "bets" do
    alias LiveBetting.Betting.Bet

    import LiveBetting.BettingFixtures

    @invalid_attrs %{status: nil, team_picked: nil, amount: nil, placed_at_second: nil, time_weight: nil}

    test "list_bets/0 returns all bets" do
      bet = bet_fixture()
      assert Betting.list_bets() == [bet]
    end

    test "get_bet!/1 returns the bet with given id" do
      bet = bet_fixture()
      assert Betting.get_bet!(bet.id) == bet
    end

    test "create_bet/1 with valid data creates a bet" do
      valid_attrs = %{status: "some status", team_picked: "some team_picked", amount: "120.5", placed_at_second: 42, time_weight: "120.5"}

      assert {:ok, %Bet{} = bet} = Betting.create_bet(valid_attrs)
      assert bet.status == "some status"
      assert bet.team_picked == "some team_picked"
      assert bet.amount == Decimal.new("120.5")
      assert bet.placed_at_second == 42
      assert bet.time_weight == Decimal.new("120.5")
    end

    test "create_bet/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Betting.create_bet(@invalid_attrs)
    end

    test "update_bet/2 with valid data updates the bet" do
      bet = bet_fixture()
      update_attrs = %{status: "some updated status", team_picked: "some updated team_picked", amount: "456.7", placed_at_second: 43, time_weight: "456.7"}

      assert {:ok, %Bet{} = bet} = Betting.update_bet(bet, update_attrs)
      assert bet.status == "some updated status"
      assert bet.team_picked == "some updated team_picked"
      assert bet.amount == Decimal.new("456.7")
      assert bet.placed_at_second == 43
      assert bet.time_weight == Decimal.new("456.7")
    end

    test "update_bet/2 with invalid data returns error changeset" do
      bet = bet_fixture()
      assert {:error, %Ecto.Changeset{}} = Betting.update_bet(bet, @invalid_attrs)
      assert bet == Betting.get_bet!(bet.id)
    end

    test "delete_bet/1 deletes the bet" do
      bet = bet_fixture()
      assert {:ok, %Bet{}} = Betting.delete_bet(bet)
      assert_raise Ecto.NoResultsError, fn -> Betting.get_bet!(bet.id) end
    end

    test "change_bet/1 returns a bet changeset" do
      bet = bet_fixture()
      assert %Ecto.Changeset{} = Betting.change_bet(bet)
    end
  end

  describe "payouts" do
    alias LiveBetting.Betting.Payout

    import LiveBetting.BettingFixtures

    @invalid_attrs %{status: nil, weight_share_pct: nil, gross_payout: nil, paid_at: nil}

    test "list_payouts/0 returns all payouts" do
      payout = payout_fixture()
      assert Betting.list_payouts() == [payout]
    end

    test "get_payout!/1 returns the payout with given id" do
      payout = payout_fixture()
      assert Betting.get_payout!(payout.id) == payout
    end

    test "create_payout/1 with valid data creates a payout" do
      valid_attrs = %{status: "some status", weight_share_pct: "120.5", gross_payout: "120.5", paid_at: ~U[2026-02-26 20:59:00Z]}

      assert {:ok, %Payout{} = payout} = Betting.create_payout(valid_attrs)
      assert payout.status == "some status"
      assert payout.weight_share_pct == Decimal.new("120.5")
      assert payout.gross_payout == Decimal.new("120.5")
      assert payout.paid_at == ~U[2026-02-26 20:59:00Z]
    end

    test "create_payout/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Betting.create_payout(@invalid_attrs)
    end

    test "update_payout/2 with valid data updates the payout" do
      payout = payout_fixture()
      update_attrs = %{status: "some updated status", weight_share_pct: "456.7", gross_payout: "456.7", paid_at: ~U[2026-02-27 20:59:00Z]}

      assert {:ok, %Payout{} = payout} = Betting.update_payout(payout, update_attrs)
      assert payout.status == "some updated status"
      assert payout.weight_share_pct == Decimal.new("456.7")
      assert payout.gross_payout == Decimal.new("456.7")
      assert payout.paid_at == ~U[2026-02-27 20:59:00Z]
    end

    test "update_payout/2 with invalid data returns error changeset" do
      payout = payout_fixture()
      assert {:error, %Ecto.Changeset{}} = Betting.update_payout(payout, @invalid_attrs)
      assert payout == Betting.get_payout!(payout.id)
    end

    test "delete_payout/1 deletes the payout" do
      payout = payout_fixture()
      assert {:ok, %Payout{}} = Betting.delete_payout(payout)
      assert_raise Ecto.NoResultsError, fn -> Betting.get_payout!(payout.id) end
    end

    test "change_payout/1 returns a payout changeset" do
      payout = payout_fixture()
      assert %Ecto.Changeset{} = Betting.change_payout(payout)
    end
  end

  describe "settlements" do
    alias LiveBetting.Betting.Settlement

    import LiveBetting.BettingFixtures

    @invalid_attrs %{total_pool: nil, house_cut: nil, distributable_pool: nil, outcome: nil, settled_at: nil}

    test "list_settlements/0 returns all settlements" do
      settlement = settlement_fixture()
      assert Betting.list_settlements() == [settlement]
    end

    test "get_settlement!/1 returns the settlement with given id" do
      settlement = settlement_fixture()
      assert Betting.get_settlement!(settlement.id) == settlement
    end

    test "create_settlement/1 with valid data creates a settlement" do
      valid_attrs = %{total_pool: "120.5", house_cut: "120.5", distributable_pool: "120.5", outcome: "some outcome", settled_at: ~U[2026-02-26 21:01:00Z]}

      assert {:ok, %Settlement{} = settlement} = Betting.create_settlement(valid_attrs)
      assert settlement.total_pool == Decimal.new("120.5")
      assert settlement.house_cut == Decimal.new("120.5")
      assert settlement.distributable_pool == Decimal.new("120.5")
      assert settlement.outcome == "some outcome"
      assert settlement.settled_at == ~U[2026-02-26 21:01:00Z]
    end

    test "create_settlement/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Betting.create_settlement(@invalid_attrs)
    end

    test "update_settlement/2 with valid data updates the settlement" do
      settlement = settlement_fixture()
      update_attrs = %{total_pool: "456.7", house_cut: "456.7", distributable_pool: "456.7", outcome: "some updated outcome", settled_at: ~U[2026-02-27 21:01:00Z]}

      assert {:ok, %Settlement{} = settlement} = Betting.update_settlement(settlement, update_attrs)
      assert settlement.total_pool == Decimal.new("456.7")
      assert settlement.house_cut == Decimal.new("456.7")
      assert settlement.distributable_pool == Decimal.new("456.7")
      assert settlement.outcome == "some updated outcome"
      assert settlement.settled_at == ~U[2026-02-27 21:01:00Z]
    end

    test "update_settlement/2 with invalid data returns error changeset" do
      settlement = settlement_fixture()
      assert {:error, %Ecto.Changeset{}} = Betting.update_settlement(settlement, @invalid_attrs)
      assert settlement == Betting.get_settlement!(settlement.id)
    end

    test "delete_settlement/1 deletes the settlement" do
      settlement = settlement_fixture()
      assert {:ok, %Settlement{}} = Betting.delete_settlement(settlement)
      assert_raise Ecto.NoResultsError, fn -> Betting.get_settlement!(settlement.id) end
    end

    test "change_settlement/1 returns a settlement changeset" do
      settlement = settlement_fixture()
      assert %Ecto.Changeset{} = Betting.change_settlement(settlement)
    end
  end
end
