defmodule LiveBettingWeb.BetLiveTest do
  use LiveBettingWeb.ConnCase

  import Phoenix.LiveViewTest
  import LiveBetting.BettingFixtures

  @create_attrs %{status: "some status", team_picked: "some team_picked", amount: "120.5", placed_at_second: 42, time_weight: "120.5"}
  @update_attrs %{status: "some updated status", team_picked: "some updated team_picked", amount: "456.7", placed_at_second: 43, time_weight: "456.7"}
  @invalid_attrs %{status: nil, team_picked: nil, amount: nil, placed_at_second: nil, time_weight: nil}
  defp create_bet(_) do
    bet = bet_fixture()

    %{bet: bet}
  end

  describe "Index" do
    setup [:create_bet]

    test "lists all bets", %{conn: conn, bet: bet} do
      {:ok, _index_live, html} = live(conn, ~p"/bets")

      assert html =~ "Listing Bets"
      assert html =~ bet.team_picked
    end

    test "saves new bet", %{conn: conn} do
      {:ok, index_live, _html} = live(conn, ~p"/bets")

      assert {:ok, form_live, _} =
               index_live
               |> element("a", "New Bet")
               |> render_click()
               |> follow_redirect(conn, ~p"/bets/new")

      assert render(form_live) =~ "New Bet"

      assert form_live
             |> form("#bet-form", bet: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#bet-form", bet: @create_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/bets")

      html = render(index_live)
      assert html =~ "Bet created successfully"
      assert html =~ "some team_picked"
    end

    test "updates bet in listing", %{conn: conn, bet: bet} do
      {:ok, index_live, _html} = live(conn, ~p"/bets")

      assert {:ok, form_live, _html} =
               index_live
               |> element("#bets-#{bet.id} a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/bets/#{bet}/edit")

      assert render(form_live) =~ "Edit Bet"

      assert form_live
             |> form("#bet-form", bet: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#bet-form", bet: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/bets")

      html = render(index_live)
      assert html =~ "Bet updated successfully"
      assert html =~ "some updated team_picked"
    end

    test "deletes bet in listing", %{conn: conn, bet: bet} do
      {:ok, index_live, _html} = live(conn, ~p"/bets")

      assert index_live |> element("#bets-#{bet.id} a", "Delete") |> render_click()
      refute has_element?(index_live, "#bets-#{bet.id}")
    end
  end

  describe "Show" do
    setup [:create_bet]

    test "displays bet", %{conn: conn, bet: bet} do
      {:ok, _show_live, html} = live(conn, ~p"/bets/#{bet}")

      assert html =~ "Show Bet"
      assert html =~ bet.team_picked
    end

    test "updates bet and returns to show", %{conn: conn, bet: bet} do
      {:ok, show_live, _html} = live(conn, ~p"/bets/#{bet}")

      assert {:ok, form_live, _} =
               show_live
               |> element("a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/bets/#{bet}/edit?return_to=show")

      assert render(form_live) =~ "Edit Bet"

      assert form_live
             |> form("#bet-form", bet: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, show_live, _html} =
               form_live
               |> form("#bet-form", bet: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/bets/#{bet}")

      html = render(show_live)
      assert html =~ "Bet updated successfully"
      assert html =~ "some updated team_picked"
    end
  end
end
