defmodule LiveBetting.MatchesTest do
  use LiveBetting.DataCase

  alias LiveBetting.Matches

  describe "matches" do
    alias LiveBetting.Matches.Match

    import LiveBetting.MatchesFixtures

    @invalid_attrs %{status: nil, team_a_name: nil, team_b_name: nil, sport: nil, winning_team: nil, starts_at: nil, ends_at: nil}

    test "list_matches/0 returns all matches" do
      match = match_fixture()
      assert Matches.list_matches() == [match]
    end

    test "get_match!/1 returns the match with given id" do
      match = match_fixture()
      assert Matches.get_match!(match.id) == match
    end

    test "create_match/1 with valid data creates a match" do
      valid_attrs = %{status: "some status", team_a_name: "some team_a_name", team_b_name: "some team_b_name", sport: "some sport", winning_team: "some winning_team", starts_at: ~U[2026-02-26 20:58:00Z], ends_at: ~U[2026-02-26 20:58:00Z]}

      assert {:ok, %Match{} = match} = Matches.create_match(valid_attrs)
      assert match.status == "some status"
      assert match.team_a_name == "some team_a_name"
      assert match.team_b_name == "some team_b_name"
      assert match.sport == "some sport"
      assert match.winning_team == "some winning_team"
      assert match.starts_at == ~U[2026-02-26 20:58:00Z]
      assert match.ends_at == ~U[2026-02-26 20:58:00Z]
    end

    test "create_match/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Matches.create_match(@invalid_attrs)
    end

    test "update_match/2 with valid data updates the match" do
      match = match_fixture()
      update_attrs = %{status: "some updated status", team_a_name: "some updated team_a_name", team_b_name: "some updated team_b_name", sport: "some updated sport", winning_team: "some updated winning_team", starts_at: ~U[2026-02-27 20:58:00Z], ends_at: ~U[2026-02-27 20:58:00Z]}

      assert {:ok, %Match{} = match} = Matches.update_match(match, update_attrs)
      assert match.status == "some updated status"
      assert match.team_a_name == "some updated team_a_name"
      assert match.team_b_name == "some updated team_b_name"
      assert match.sport == "some updated sport"
      assert match.winning_team == "some updated winning_team"
      assert match.starts_at == ~U[2026-02-27 20:58:00Z]
      assert match.ends_at == ~U[2026-02-27 20:58:00Z]
    end

    test "update_match/2 with invalid data returns error changeset" do
      match = match_fixture()
      assert {:error, %Ecto.Changeset{}} = Matches.update_match(match, @invalid_attrs)
      assert match == Matches.get_match!(match.id)
    end

    test "delete_match/1 deletes the match" do
      match = match_fixture()
      assert {:ok, %Match{}} = Matches.delete_match(match)
      assert_raise Ecto.NoResultsError, fn -> Matches.get_match!(match.id) end
    end

    test "change_match/1 returns a match changeset" do
      match = match_fixture()
      assert %Ecto.Changeset{} = Matches.change_match(match)
    end
  end

  describe "pools" do
    alias LiveBetting.Matches.Pool

    import LiveBetting.MatchesFixtures

    @invalid_attrs %{team: nil, total_amount: nil, total_weight: nil}

    test "list_pools/0 returns all pools" do
      pool = pool_fixture()
      assert Matches.list_pools() == [pool]
    end

    test "get_pool!/1 returns the pool with given id" do
      pool = pool_fixture()
      assert Matches.get_pool!(pool.id) == pool
    end

    test "create_pool/1 with valid data creates a pool" do
      valid_attrs = %{team: "some team", total_amount: "120.5", total_weight: "120.5"}

      assert {:ok, %Pool{} = pool} = Matches.create_pool(valid_attrs)
      assert pool.team == "some team"
      assert pool.total_amount == Decimal.new("120.5")
      assert pool.total_weight == Decimal.new("120.5")
    end

    test "create_pool/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Matches.create_pool(@invalid_attrs)
    end

    test "update_pool/2 with valid data updates the pool" do
      pool = pool_fixture()
      update_attrs = %{team: "some updated team", total_amount: "456.7", total_weight: "456.7"}

      assert {:ok, %Pool{} = pool} = Matches.update_pool(pool, update_attrs)
      assert pool.team == "some updated team"
      assert pool.total_amount == Decimal.new("456.7")
      assert pool.total_weight == Decimal.new("456.7")
    end

    test "update_pool/2 with invalid data returns error changeset" do
      pool = pool_fixture()
      assert {:error, %Ecto.Changeset{}} = Matches.update_pool(pool, @invalid_attrs)
      assert pool == Matches.get_pool!(pool.id)
    end

    test "delete_pool/1 deletes the pool" do
      pool = pool_fixture()
      assert {:ok, %Pool{}} = Matches.delete_pool(pool)
      assert_raise Ecto.NoResultsError, fn -> Matches.get_pool!(pool.id) end
    end

    test "change_pool/1 returns a pool changeset" do
      pool = pool_fixture()
      assert %Ecto.Changeset{} = Matches.change_pool(pool)
    end
  end

  describe "windows" do
    alias LiveBetting.Matches.Window

    import LiveBetting.MatchesFixtures

    @invalid_attrs %{status: nil, sequence_number: nil, opens_at: nil, closes_at: nil, duration_seconds: nil, resolution_type: nil, winning_team: nil, house_takeout_pct: nil}

    test "list_windows/0 returns all windows" do
      window = window_fixture()
      assert Matches.list_windows() == [window]
    end

    test "get_window!/1 returns the window with given id" do
      window = window_fixture()
      assert Matches.get_window!(window.id) == window
    end

    test "create_window/1 with valid data creates a window" do
      valid_attrs = %{status: "some status", sequence_number: 42, opens_at: ~U[2026-02-26 20:59:00Z], closes_at: ~U[2026-02-26 20:59:00Z], duration_seconds: 42, resolution_type: "some resolution_type", winning_team: "some winning_team", house_takeout_pct: "120.5"}

      assert {:ok, %Window{} = window} = Matches.create_window(valid_attrs)
      assert window.status == "some status"
      assert window.sequence_number == 42
      assert window.opens_at == ~U[2026-02-26 20:59:00Z]
      assert window.closes_at == ~U[2026-02-26 20:59:00Z]
      assert window.duration_seconds == 42
      assert window.resolution_type == "some resolution_type"
      assert window.winning_team == "some winning_team"
      assert window.house_takeout_pct == Decimal.new("120.5")
    end

    test "create_window/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Matches.create_window(@invalid_attrs)
    end

    test "update_window/2 with valid data updates the window" do
      window = window_fixture()
      update_attrs = %{status: "some updated status", sequence_number: 43, opens_at: ~U[2026-02-27 20:59:00Z], closes_at: ~U[2026-02-27 20:59:00Z], duration_seconds: 43, resolution_type: "some updated resolution_type", winning_team: "some updated winning_team", house_takeout_pct: "456.7"}

      assert {:ok, %Window{} = window} = Matches.update_window(window, update_attrs)
      assert window.status == "some updated status"
      assert window.sequence_number == 43
      assert window.opens_at == ~U[2026-02-27 20:59:00Z]
      assert window.closes_at == ~U[2026-02-27 20:59:00Z]
      assert window.duration_seconds == 43
      assert window.resolution_type == "some updated resolution_type"
      assert window.winning_team == "some updated winning_team"
      assert window.house_takeout_pct == Decimal.new("456.7")
    end

    test "update_window/2 with invalid data returns error changeset" do
      window = window_fixture()
      assert {:error, %Ecto.Changeset{}} = Matches.update_window(window, @invalid_attrs)
      assert window == Matches.get_window!(window.id)
    end

    test "delete_window/1 deletes the window" do
      window = window_fixture()
      assert {:ok, %Window{}} = Matches.delete_window(window)
      assert_raise Ecto.NoResultsError, fn -> Matches.get_window!(window.id) end
    end

    test "change_window/1 returns a window changeset" do
      window = window_fixture()
      assert %Ecto.Changeset{} = Matches.change_window(window)
    end
  end

  describe "windows" do
    alias LiveBetting.Matches.Window

    import LiveBetting.MatchesFixtures

    @invalid_attrs %{status: nil, sequence_number: nil, opens_at: nil, closes_at: nil, duration_seconds: nil, resolution_type: nil, winning_team: nil, house_takeout_pct: nil}

    test "list_windows/0 returns all windows" do
      window = window_fixture()
      assert Matches.list_windows() == [window]
    end

    test "get_window!/1 returns the window with given id" do
      window = window_fixture()
      assert Matches.get_window!(window.id) == window
    end

    test "create_window/1 with valid data creates a window" do
      valid_attrs = %{status: "some status", sequence_number: 42, opens_at: ~U[2026-02-26 21:04:00Z], closes_at: ~U[2026-02-26 21:04:00Z], duration_seconds: 42, resolution_type: "some resolution_type", winning_team: "some winning_team", house_takeout_pct: "120.5"}

      assert {:ok, %Window{} = window} = Matches.create_window(valid_attrs)
      assert window.status == "some status"
      assert window.sequence_number == 42
      assert window.opens_at == ~U[2026-02-26 21:04:00Z]
      assert window.closes_at == ~U[2026-02-26 21:04:00Z]
      assert window.duration_seconds == 42
      assert window.resolution_type == "some resolution_type"
      assert window.winning_team == "some winning_team"
      assert window.house_takeout_pct == Decimal.new("120.5")
    end

    test "create_window/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Matches.create_window(@invalid_attrs)
    end

    test "update_window/2 with valid data updates the window" do
      window = window_fixture()
      update_attrs = %{status: "some updated status", sequence_number: 43, opens_at: ~U[2026-02-27 21:04:00Z], closes_at: ~U[2026-02-27 21:04:00Z], duration_seconds: 43, resolution_type: "some updated resolution_type", winning_team: "some updated winning_team", house_takeout_pct: "456.7"}

      assert {:ok, %Window{} = window} = Matches.update_window(window, update_attrs)
      assert window.status == "some updated status"
      assert window.sequence_number == 43
      assert window.opens_at == ~U[2026-02-27 21:04:00Z]
      assert window.closes_at == ~U[2026-02-27 21:04:00Z]
      assert window.duration_seconds == 43
      assert window.resolution_type == "some updated resolution_type"
      assert window.winning_team == "some updated winning_team"
      assert window.house_takeout_pct == Decimal.new("456.7")
    end

    test "update_window/2 with invalid data returns error changeset" do
      window = window_fixture()
      assert {:error, %Ecto.Changeset{}} = Matches.update_window(window, @invalid_attrs)
      assert window == Matches.get_window!(window.id)
    end

    test "delete_window/1 deletes the window" do
      window = window_fixture()
      assert {:ok, %Window{}} = Matches.delete_window(window)
      assert_raise Ecto.NoResultsError, fn -> Matches.get_window!(window.id) end
    end

    test "change_window/1 returns a window changeset" do
      window = window_fixture()
      assert %Ecto.Changeset{} = Matches.change_window(window)
    end
  end
end
