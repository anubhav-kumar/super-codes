defmodule LiveBettingWeb.MatchLiveTest do
  use LiveBettingWeb.ConnCase

  import Phoenix.LiveViewTest
  import LiveBetting.MatchesFixtures

  @create_attrs %{status: "some status", team_a_name: "some team_a_name", team_b_name: "some team_b_name", sport: "some sport", winning_team: "some winning_team", starts_at: "2026-02-26T20:58:00Z", ends_at: "2026-02-26T20:58:00Z"}
  @update_attrs %{status: "some updated status", team_a_name: "some updated team_a_name", team_b_name: "some updated team_b_name", sport: "some updated sport", winning_team: "some updated winning_team", starts_at: "2026-02-27T20:58:00Z", ends_at: "2026-02-27T20:58:00Z"}
  @invalid_attrs %{status: nil, team_a_name: nil, team_b_name: nil, sport: nil, winning_team: nil, starts_at: nil, ends_at: nil}
  defp create_match(_) do
    match = match_fixture()

    %{match: match}
  end

  describe "Index" do
    setup [:create_match]

    test "lists all matches", %{conn: conn, match: match} do
      {:ok, _index_live, html} = live(conn, ~p"/matches")

      assert html =~ "Listing Matches"
      assert html =~ match.team_a_name
    end

    test "saves new match", %{conn: conn} do
      {:ok, index_live, _html} = live(conn, ~p"/matches")

      assert {:ok, form_live, _} =
               index_live
               |> element("a", "New Match")
               |> render_click()
               |> follow_redirect(conn, ~p"/matches/new")

      assert render(form_live) =~ "New Match"

      assert form_live
             |> form("#match-form", match: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#match-form", match: @create_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/matches")

      html = render(index_live)
      assert html =~ "Match created successfully"
      assert html =~ "some team_a_name"
    end

    test "updates match in listing", %{conn: conn, match: match} do
      {:ok, index_live, _html} = live(conn, ~p"/matches")

      assert {:ok, form_live, _html} =
               index_live
               |> element("#matches-#{match.id} a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/matches/#{match}/edit")

      assert render(form_live) =~ "Edit Match"

      assert form_live
             |> form("#match-form", match: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#match-form", match: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/matches")

      html = render(index_live)
      assert html =~ "Match updated successfully"
      assert html =~ "some updated team_a_name"
    end

    test "deletes match in listing", %{conn: conn, match: match} do
      {:ok, index_live, _html} = live(conn, ~p"/matches")

      assert index_live |> element("#matches-#{match.id} a", "Delete") |> render_click()
      refute has_element?(index_live, "#matches-#{match.id}")
    end
  end

  describe "Show" do
    setup [:create_match]

    test "displays match", %{conn: conn, match: match} do
      {:ok, _show_live, html} = live(conn, ~p"/matches/#{match}")

      assert html =~ "Show Match"
      assert html =~ match.team_a_name
    end

    test "updates match and returns to show", %{conn: conn, match: match} do
      {:ok, show_live, _html} = live(conn, ~p"/matches/#{match}")

      assert {:ok, form_live, _} =
               show_live
               |> element("a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/matches/#{match}/edit?return_to=show")

      assert render(form_live) =~ "Edit Match"

      assert form_live
             |> form("#match-form", match: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, show_live, _html} =
               form_live
               |> form("#match-form", match: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/matches/#{match}")

      html = render(show_live)
      assert html =~ "Match updated successfully"
      assert html =~ "some updated team_a_name"
    end
  end
end
